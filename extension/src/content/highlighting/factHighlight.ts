import type { HighlightContext, TextPointer } from "../articleScraper";
import type { HighlightSpan, HighlightResult } from "../../types/highlightTypes";
import { ensureTooltip, attachTooltip, hideTooltip } from "./highlightTooltip";

const TYPE_COLORS: Record<string, { light: string; dark: string }> = {
	fact: { light: "#c8f7c5", dark: "#2b5f33" },
	opinion: { light: "#f7c5c5", dark: "#5f2b2b" },
	uncertain: { light: "#0000000b", dark: "#ffffff14" } // brak koloru bardziej pokazuje brak opinii
};

let __cachedPageDarkMode: boolean | null = null;
let __highlightBgObserver: MutationObserver | null = null;
let __bgChangeTimeout: number | null = null;
let __matchMediaQuery: MediaQueryList | null = null;
let __matchMediaListener: ((e: MediaQueryListEvent) => void) | null = null;
let __lastIsDark: boolean | null = null;

function parseRGB(color: string): [number, number, number, number] | null {
	if (!color) return null;
	const temp = document.createElement("div");
	temp.style.color = color;
	temp.style.display = "none";
	document.documentElement.appendChild(temp);
	const cs = getComputedStyle(temp).color;
	document.documentElement.removeChild(temp);
	const m = cs.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/);
	if (!m) return null;
	return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] ? parseFloat(m[4]) : 1];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
	const srgb = [r, g, b].map(v => v / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
	return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function getEffectivePageBackgroundColor(): string {
	const body = document.body;
	const candidates = [body, document.documentElement];
	for (const el of candidates) {
		if (!el) continue;
		const cs = getComputedStyle(el).backgroundColor;
		if (cs && cs !== "transparent" && cs !== "rgba(0, 0, 0, 0)") {
			return cs;
		}
	}
	return getComputedStyle(document.documentElement).backgroundColor || "rgb(255, 255, 255)";
}

function detectPageDarkMode(): boolean {
	if (__cachedPageDarkMode !== null) return __cachedPageDarkMode;

	try {
		const bg = getEffectivePageBackgroundColor();
		const parsed = parseRGB(bg);
		if (parsed) {
			// If background has transparency, prefer prefers-color-scheme instead
			const alpha = parsed[3] ?? 1;
			if (alpha < 0.6) {
				// treat as unknown and fall through to prefers-color-scheme
			} else {
				// Use a slightly higher luminance threshold so "dark" (not only black)
				// backgrounds are detected as dark. 0.6 covers moderately dark backgrounds.
				const lum = relativeLuminance([parsed[0], parsed[1], parsed[2]]);
				__cachedPageDarkMode = lum < 0.6;
				return __cachedPageDarkMode;
			}
		}
	} catch (e) {
		// ignore and fall back
	}

	// If top-level backgrounds were transparent or inconclusive, try sampling
	// the element at the center of the viewport and walk up to find a real background.
	try {
		const cx = Math.round((window.innerWidth || document.documentElement.clientWidth) / 2);
		const cy = Math.round((window.innerHeight || document.documentElement.clientHeight) / 2);
		const el = document.elementFromPoint(cx, cy) as Element | null;
		if (el) {
			let walker: Element | null = el;
			while (walker) {
				const cs = getComputedStyle(walker).backgroundColor;
				if (cs && cs !== "transparent" && cs !== "rgba(0, 0, 0, 0)") {
					const parsed2 = parseRGB(cs);
					if (parsed2) {
						const alpha2 = parsed2[3] ?? 1;
						if (alpha2 >= 0.6) {
							const lum2 = relativeLuminance([parsed2[0], parsed2[1], parsed2[2]]);
							__cachedPageDarkMode = lum2 < 0.6;
							return __cachedPageDarkMode;
						}
					}
				}
				walker = walker.parentElement;
			}
		}
	} catch (e) {
		// ignore
	}

	if (typeof window !== "undefined" && (window as any).matchMedia) {
		try {
			__cachedPageDarkMode = !!window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
			return __cachedPageDarkMode;
		} catch (e) {
			// ignore
		}
	}

	__cachedPageDarkMode = false;
	return __cachedPageDarkMode;
}

function colorStringToRGBTuple(colorStr: string): [number, number, number] | null {
	const parsed = parseRGB(colorStr);
	if (!parsed) return null;
	return [parsed[0], parsed[1], parsed[2]];
}


function updateHighlights(isDark: boolean): void {
	const highlightedSpans = document.querySelectorAll<HTMLElement>("span[data-factcheck-highlight]");
	highlightedSpans.forEach(el => {
		const typeKey = el.dataset.type ?? "fact";
		const typeEntry = TYPE_COLORS[typeKey];
		const color = typeEntry ? (isDark ? typeEntry.dark : typeEntry.light) : "#00000000";
		el.style.backgroundColor = color;
	});
}

function startBackgroundChangeListener(): void {
	// stop previous to avoid duplicates
	stopBackgroundChangeListener();

	try {
		__lastIsDark = detectPageDarkMode();

		__highlightBgObserver = new MutationObserver(() => {
			if (__bgChangeTimeout != null) {
				clearTimeout(__bgChangeTimeout);
			}
			__bgChangeTimeout = window.setTimeout(() => {
				__cachedPageDarkMode = null;
				const newIsDark = detectPageDarkMode();
				if (newIsDark !== __lastIsDark) {
					__lastIsDark = newIsDark;
					updateHighlights(newIsDark);
				}
			}, 80);
		});

		// Observe changes that commonly affect page background / theme
		const observeTarget1 = document.documentElement;
		const observeTarget2 = document.body || null;

		const opts: MutationObserverInit = { attributes: true, attributeFilter: ["class", "style"], subtree: true, childList: false };

		if (observeTarget1) __highlightBgObserver.observe(observeTarget1, opts);
		if (observeTarget2) __highlightBgObserver.observe(observeTarget2, opts);

		// Listen to prefers-color-scheme changes as well
		if (typeof window !== "undefined" && (window as any).matchMedia) {
			try {
				__matchMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
				__matchMediaListener = (e: MediaQueryListEvent) => {
					__cachedPageDarkMode = null;
					const newIsDark = !!e.matches;
					if (newIsDark !== __lastIsDark) {
						__lastIsDark = newIsDark;
						updateHighlights(newIsDark);
					}
				};
				// modern API
				if (typeof __matchMediaQuery.addEventListener === "function") {
					__matchMediaQuery.addEventListener("change", __matchMediaListener as any);
				} else if (typeof __matchMediaQuery.addListener === "function") {
					// older API
					(__matchMediaQuery as any).addListener(__matchMediaListener);
				}
			} catch (e) {
				// ignore
			}
		}
	} catch (e) {
		// ignore any errors here to avoid breaking page scripts
	}
}

function stopBackgroundChangeListener(): void {
	try {
		if (__highlightBgObserver) {
			__highlightBgObserver.disconnect();
			__highlightBgObserver = null;
		}
		if (__bgChangeTimeout != null) {
			clearTimeout(__bgChangeTimeout);
			__bgChangeTimeout = null;
		}
		if (__matchMediaQuery && __matchMediaListener) {
			if (typeof __matchMediaQuery.removeEventListener === "function") {
				__matchMediaQuery.removeEventListener("change", __matchMediaListener as any);
			} else if (typeof (__matchMediaQuery as any).removeListener === "function") {
				(__matchMediaQuery as any).removeListener(__matchMediaListener);
			}
		}
		__matchMediaQuery = null;
		__matchMediaListener = null;
		__lastIsDark = null;
	} catch (e) {
		// ignore
	}
}

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

	// stop listening for background / theme changes when highlights are removed
	stopBackgroundChangeListener();
}

export function highlightText(result: HighlightResult | null | undefined, context?: HighlightContext): void {
	// Recompute dark mode per-run to avoid stale cached value across pages
	__cachedPageDarkMode = null;
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
		
		for (const highlight of highlights) {
			attachTooltip(highlight, span);
		}
	}

	// Start listening for background / theme changes so highlight colors update
	startBackgroundChangeListener();
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
	const typeKey = span.type ?? "fact";
	const typeEntry = TYPE_COLORS[typeKey];
	const isDark = detectPageDarkMode();
	const color = typeEntry ? (isDark ? typeEntry.dark : typeEntry.light) : "#00000000";

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

	const blockElements = findBlockElementsInRange(range, BLOCK_TAGS);

	if (blockElements.length > 0) {
		return wrapRangeAcrossBlocks(range, span, color, BLOCK_TAGS);
	}

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
	const textNodesWithOffsets: Array<{ node: Text; startOffset: number; endOffset: number }> = [];
	collectTextNodesInRange(range, textNodesWithOffsets);

	if (textNodesWithOffsets.length === 0) {
		return [createHighlightSpan(color, span)];
	}

	const groups = groupTextNodesByBlock(textNodesWithOffsets, blockTags);

	const wrappers: HTMLElement[] = [];
	for (let i = groups.length - 1; i >= 0; i--) {
		const group = groups[i];
		const wrapper = wrapTextNodeGroup(group, color, span);
		wrappers.unshift(wrapper); 
	}

	return wrappers;
}

function wrapRangeWithinBlock(range: Range, span: HighlightSpan, color: string): HTMLElement {
	const wrapper = createHighlightSpan(color, span);

	try {
		range.surroundContents(wrapper);
		return wrapper;
	} catch (e) {
		try {
			const fragment = range.extractContents();
			wrapper.appendChild(fragment);
			range.insertNode(wrapper);
			return wrapper;
		} catch (err) {
			console.warn("FactCheck: unable to wrap range", err);
			
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

	const groupRange = document.createRange();
	groupRange.setStart(textNodes[0].node, textNodes[0].startOffset);
	const lastNode = textNodes[textNodes.length - 1];
	groupRange.setEnd(lastNode.node, lastNode.endOffset);

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

	const safeStart = Math.max(0, Math.min(startOffset, textLength));
	const safeEnd = Math.max(safeStart, Math.min(endOffset, textLength));

	const wrapper = createHighlightSpan(color, span);

	
	if (safeStart === 0 && safeEnd === textLength) {

		const parent = textNode.parentNode;
		if (parent) {
			parent.insertBefore(wrapper, textNode);
			wrapper.appendChild(textNode);
		}
	} else if (safeStart === 0) {
		const beforeText = textNode.splitText(safeEnd);
		const parent = textNode.parentNode;
		if (parent) {
			parent.insertBefore(wrapper, beforeText);
			wrapper.appendChild(textNode);
		}
	} else if (safeEnd === textLength) {
		const wrappedText = textNode.splitText(safeStart);
		const parent = wrappedText.parentNode;
		if (parent) {
			parent.insertBefore(wrapper, wrappedText);
			wrapper.appendChild(wrappedText);
		}
	} else {
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
