import type { HighlightContext, TextPointer } from "./articleScraper";

const TYPE_COLORS: Record<string, string> = {
	fact: "#c8f7c5",
	opinion: "#f7c5c5",
	uncertain: "#f7e9c5"
};

interface HighlightSpan {
	start: number;
	end: number;
	type?: keyof typeof TYPE_COLORS | string;
	rationale?: string;
	confidence?: number;
}

interface HighlightResult {
	spans: HighlightSpan[];
}

let tooltip: HTMLDivElement | null = null;

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
		if (!range) {
			continue;
		}
		const highlight = wrapRange(range, span);
		attachTooltip(highlight, span);
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

	const range = document.createRange();
	range.setStart(startEntry.startNode, startEntry.startOffset);
	range.setEnd(endEntry.endNode, endEntry.endOffset);
	if (range.collapsed) {
		return null;
	}
	return range;
}

function wrapRange(range: Range, span: HighlightSpan): HTMLElement {
	const color = TYPE_COLORS[span.type ?? "fact"] ?? "#ddd";
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
	// Preserve layout by ensuring inline display and proper text flow
	wrapper.style.display = "inline";
	wrapper.style.whiteSpace = "inherit";
	wrapper.style.wordWrap = "inherit";
	wrapper.style.wordBreak = "inherit";
	wrapper.style.lineHeight = "inherit";
	wrapper.style.fontSize = "inherit";
	wrapper.style.fontFamily = "inherit";
	wrapper.style.fontWeight = "inherit";
	wrapper.style.fontStyle = "inherit";
	wrapper.style.textDecoration = "inherit";

	const fragment = range.extractContents();
	wrapper.appendChild(fragment);
	range.insertNode(wrapper);
	return wrapper;
}

function attachTooltip(node: HTMLElement, span: HighlightSpan): void {
	node.addEventListener("mouseenter", event => {
		const html = buildTooltipHtml(span);
		showTooltip(event as MouseEvent, html);
	});
	node.addEventListener("mouseleave", hideTooltip);
}

function ensureTooltip(): void {
	if (tooltip) return;
	tooltip = document.createElement("div");
	tooltip.style.position = "absolute";
	tooltip.style.padding = "8px 12px";
	tooltip.style.background = "rgba(0,0,0,0.85)";
	tooltip.style.color = "white";
	tooltip.style.borderRadius = "6px";
	tooltip.style.fontSize = "13px";
	tooltip.style.pointerEvents = "none";
	tooltip.style.zIndex = "999999";
	tooltip.style.display = "none";
	document.body.appendChild(tooltip);
}

function showTooltip(event: MouseEvent, html: string): void {
	ensureTooltip();
	if (!tooltip) return;

	tooltip.innerHTML = html;

	let x = event.pageX + 10;
	let y = event.pageY + 10;

	if (x + tooltip.offsetWidth > window.innerWidth) {
		x = event.pageX - tooltip.offsetWidth - 10;
	}
	if (y + tooltip.offsetHeight > window.innerHeight) {
		y = window.innerHeight - tooltip.offsetHeight - 10;
	}

	tooltip.style.left = `${x}px`;
	tooltip.style.top = `${y}px`;
	tooltip.style.display = "block";
}

function hideTooltip(): void {
	if (tooltip) {
		tooltip.style.display = "none";
	}
}

function buildTooltipHtml(span: HighlightSpan): string {
	const type = escapeHtml(span.type ?? "unknown");
	const confidence = typeof span.confidence === "number" ? `${Math.round(span.confidence * 100)}%` : "n/a";
	const rationale = escapeHtml(span.rationale ?? "No rationale provided.");
	return `<div><strong>Type:</strong> ${type}</div><div><strong>Confidence:</strong> ${confidence}</div><div><strong>Rationale:</strong> ${rationale}</div>`;
}

function escapeHtml(value: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;"
	};
	return value.replace(/[&<>"']/g, ch => map[ch] ?? ch);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
