import type { HighlightContext, TextPointer } from "../articleScraper";
import type { HighlightSpan, HighlightResult } from "../../types/highlightTypes";
import { ensureTooltip, attachTooltip, hideTooltip } from "./highlightTooltip";

const TYPE_COLORS: Record<string, string> = {
	fact: "#c8f7c5",
	opinion: "#f7c5c5",
	uncertain: "#f7e9c5"
};

export function removeHighlights(): void {
	const highlightedSpans = document.querySelectorAll<HTMLElement>("span[data-factcheck-highlight]");
	highlightedSpans.forEach(span => {
		const parent = span.parentNode;
		if (!parent) return;
		while (span.firstChild) {
			parent.insertBefore(span.firstChild, span);
		}
		span.remove();
	});
	hideTooltip();
}

export function highlightText(result: HighlightResult | null | undefined, context?: HighlightContext): void {
	if (!result || !Array.isArray(result.spans) || result.spans.length === 0 || !context || !context.pointers?.length) {
		removeHighlights();
		return;
	}

	removeHighlights();
	ensureTooltip();

	const sortedSpans = [...result.spans].filter(isValidSpan).sort((a, b) => b.start - a.start || b.end - a.end);

	for (const span of sortedSpans) {
		const range = createRangeFromPointers(context.pointers, span.start, span.end);
		if (!range) continue;

		const highlights = wrapRange(range, span);
		// Attach tooltip to all wrapper elements (a sentence may span multiple blocks)
		for (const highlight of highlights) {
			attachTooltip(highlight, span);
		}
	}
}

function isValidSpan(span: HighlightSpan): boolean {
	return Number.isFinite(span.start) && Number.isFinite(span.end) && span.end > span.start;
}

function createRangeFromPointers(pointers: TextPointer[], start: number, end: number): Range | null {
	if (!pointers.length) return null;

	const clampedStart = clamp(Math.floor(start), 0, pointers.length - 1);
	const clampedEnd = clamp(Math.ceil(end), clampedStart + 1, pointers.length);

	const startEntry = pointers[clampedStart];
	const endEntry = pointers[clampedEnd - 1];
	if (!startEntry || !endEntry) return null;
	if (!startEntry.startNode.isConnected || !endEntry.endNode.isConnected) return null;

	const startNodeLength = startEntry.startNode.textContent?.length ?? 0;
	const endNodeLength = endEntry.endNode.textContent?.length ?? 0;
	const safeStartOffset = clamp(startEntry.startOffset, 0, startNodeLength);
	const safeEndOffset = clamp(endEntry.endOffset, 0, endNodeLength);

	if (
		safeStartOffset >= startNodeLength &&
		startEntry.startNode === endEntry.endNode &&
		safeEndOffset <= safeStartOffset
	) {
		return null;
	}
	if (safeStartOffset === safeEndOffset && startEntry.startNode === endEntry.endNode) {
		return null;
	}

	const range = document.createRange();
	try {
		range.setStart(startEntry.startNode, safeStartOffset);
		range.setEnd(endEntry.endNode, safeEndOffset);
	} catch (err) {
		console.warn("FactCheck: unable to create highlight range", err);
		return null;
	}
	if (range.collapsed) {
		return null;
	}
	return range;
}

function wrapRange(range: Range, span: HighlightSpan): HTMLElement[] {
	const color = TYPE_COLORS[span.type ?? "fact"] ?? "#ddd";

	// Block-level elements that should NOT be included inside highlight spans
	const BLOCK_TAGS = new Set([
		"ADDRESS",
		"ARTICLE",
		"ASIDE",
		"BLOCKQUOTE",
		"DETAILS",
		"DIALOG",
		"DD",
		"DIV",
		"DL",
		"DT",
		"FIELDSET",
		"FIGCAPTION",
		"FIGURE",
		"FOOTER",
		"FORM",
		"H1",
		"H2",
		"H3",
		"H4",
		"H5",
		"H6",
		"HEADER",
		"HGROUP",
		"HR",
		"LI",
		"MAIN",
		"NAV",
		"OL",
		"P",
		"PRE",
		"SECTION",
		"TABLE",
		"UL"
	]);

	// Check if range spans across block-level elements
	const blockElements = findBlockElementsInRange(range, BLOCK_TAGS);

	if (blockElements.length > 0) {
		// Range spans multiple blocks - need to wrap each block separately
		return wrapRangeAcrossBlocks(range, span, color, BLOCK_TAGS);
	}

	// Range is within a single block - can wrap directly
	return [wrapRangeWithinBlock(range, span, color)];
}

function findBlockElementsInRange(range: Range, blockTags: Set<string>): Element[] {
	const blocks: Element[] = [];
	const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_ELEMENT, {
		acceptNode: node => {
			const element = node as Element;
			if (blockTags.has(element.tagName) && range.intersectsNode(element)) {
				return NodeFilter.FILTER_ACCEPT;
			}
			return NodeFilter.FILTER_SKIP;
		}
	});

	let node = walker.nextNode();
	while (node) {
		blocks.push(node as Element);
		node = walker.nextNode();
	}

	return blocks;
}

function wrapRangeAcrossBlocks(range: Range, span: HighlightSpan, color: string, blockTags: Set<string>): HTMLElement[] {
	// Collect all text nodes in the range
	const textNodesWithOffsets: Array<{ node: Text; startOffset: number; endOffset: number }> = [];
	collectTextNodesInRange(range, textNodesWithOffsets);

	if (textNodesWithOffsets.length === 0) {
		return [createHighlightSpan(color, span)];
	}

	// Group text nodes by their containing block
	const groups = groupTextNodesByBlock(textNodesWithOffsets, blockTags);

	// Wrap each group and collect all wrappers
	const wrappers: HTMLElement[] = [];
	for (let i = groups.length - 1; i >= 0; i--) {
		const group = groups[i];
		const wrapper = wrapTextNodeGroup(group, color, span);
		wrappers.unshift(wrapper); // Add to beginning to maintain order
	}

	return wrappers;
}

function wrapRangeWithinBlock(range: Range, span: HighlightSpan, color: string): HTMLElement {
	const wrapper = createHighlightSpan(color, span);

	try {
		// Try to use surroundContents if possible (most efficient)
		range.surroundContents(wrapper);
		return wrapper;
	} catch (e) {
		// surroundContents failed, fall back to extract and insert
		try {
			const fragment = range.extractContents();
			wrapper.appendChild(fragment);
			range.insertNode(wrapper);
			return wrapper;
		} catch (err) {
			console.warn("FactCheck: unable to wrap range", err);
			// Last resort: wrap individual text nodes
			const textNodesWithOffsets: Array<{ node: Text; startOffset: number; endOffset: number }> = [];
			collectTextNodesInRange(range, textNodesWithOffsets);

			if (textNodesWithOffsets.length === 0) {
				return wrapper;
			}

			for (let i = textNodesWithOffsets.length - 1; i >= 0; i--) {
				const { node, startOffset, endOffset } = textNodesWithOffsets[i];
				wrapTextNodePortion(node, startOffset, endOffset, color, span);
			}

			return wrapper;
		}
	}
}

function groupTextNodesByBlock(
	textNodes: Array<{ node: Text; startOffset: number; endOffset: number }>,
	blockTags: Set<string>
): Array<Array<{ node: Text; startOffset: number; endOffset: number }>> {
	const groups: Array<Array<{ node: Text; startOffset: number; endOffset: number }>> = [];
	let currentGroup: Array<{ node: Text; startOffset: number; endOffset: number }> = [];
	let currentBlock: Element | null = null;

	for (const item of textNodes) {
		// Find the containing block element
		let block: Element | null = null;
		let parent = item.node.parentElement;
		while (parent) {
			if (blockTags.has(parent.tagName)) {
				block = parent;
				break;
			}
			parent = parent.parentElement;
		}

		if (block !== currentBlock) {
			if (currentGroup.length > 0) {
				groups.push(currentGroup);
			}
			currentGroup = [item];
			currentBlock = block;
		} else {
			currentGroup.push(item);
		}
	}

	if (currentGroup.length > 0) {
		groups.push(currentGroup);
	}

	return groups;
}

function wrapTextNodeGroup(
	textNodes: Array<{ node: Text; startOffset: number; endOffset: number }>,
	color: string,
	span: HighlightSpan
): HTMLElement {
	if (textNodes.length === 0) {
		return createHighlightSpan(color, span);
	}

	// Create a range spanning all text nodes in the group
	const groupRange = document.createRange();
	groupRange.setStart(textNodes[0].node, textNodes[0].startOffset);
	const lastNode = textNodes[textNodes.length - 1];
	groupRange.setEnd(lastNode.node, lastNode.endOffset);

	// Try to wrap the range
	return wrapRangeWithinBlock(groupRange, span, color);
}

function createHighlightSpan(color: string, span: HighlightSpan): HTMLElement {
	const wrapper = document.createElement("span");
	wrapper.dataset.factcheckHighlight = "true";
	wrapper.dataset.type = span.type ?? "unknown";
	if (typeof span.confidence === "number") {
		wrapper.dataset.confidence = span.confidence.toString();
	}
	if (span.rationale) {
		wrapper.dataset.rationale = span.rationale;
	}
	wrapper.style.backgroundColor = color;
	wrapper.style.cursor = "pointer";
	return wrapper;
}

function collectTextNodesInRange(range: Range, result: Array<{ node: Text; startOffset: number; endOffset: number }>): void {
	const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT, {
		acceptNode: node => {
			return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
		}
	});

	let currentNode = walker.nextNode();
	while (currentNode) {
		const textNode = currentNode as Text;
		const textContent = textNode.textContent ?? "";

		if (textContent.trim().length > 0) {
			// Determine the start and end offsets within this text node
			const isStartNode = textNode === range.startContainer;
			const isEndNode = textNode === range.endContainer;

			const startOffset = isStartNode ? range.startOffset : 0;
			const endOffset = isEndNode ? range.endOffset : textContent.length;

			if (startOffset < endOffset) {
				result.push({ node: textNode, startOffset, endOffset });
			}
		}

		currentNode = walker.nextNode();
	}
}

function wrapTextNodePortion(
	textNode: Text,
	startOffset: number,
	endOffset: number,
	color: string,
	span: HighlightSpan
): HTMLElement {
	const textContent = textNode.textContent ?? "";
	const textLength = textContent.length;

	// Clamp offsets
	const safeStart = Math.max(0, Math.min(startOffset, textLength));
	const safeEnd = Math.max(safeStart, Math.min(endOffset, textLength));

	const wrapper = createHighlightSpan(color, span);

	// Split the text node if necessary
	if (safeStart === 0 && safeEnd === textLength) {
		// Wrap the entire text node
		const parent = textNode.parentNode;
		if (parent) {
			parent.insertBefore(wrapper, textNode);
			wrapper.appendChild(textNode);
		}
	} else if (safeStart === 0) {
		// Wrap from start to middle
		const beforeText = textNode.splitText(safeEnd);
		const parent = textNode.parentNode;
		if (parent) {
			parent.insertBefore(wrapper, beforeText);
			wrapper.appendChild(textNode);
		}
	} else if (safeEnd === textLength) {
		// Wrap from middle to end
		const wrappedText = textNode.splitText(safeStart);
		const parent = wrappedText.parentNode;
		if (parent) {
			parent.insertBefore(wrapper, wrappedText);
			wrapper.appendChild(wrappedText);
		}
	} else {
		// Wrap middle portion
		const afterText = textNode.splitText(safeEnd);
		const wrappedText = textNode.splitText(safeStart);
		const parent = wrappedText.parentNode;
		if (parent) {
			parent.insertBefore(wrapper, afterText);
			wrapper.appendChild(wrappedText);
		}
	}

	return wrapper;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
