import type { HighlightSpan } from "../types/highlightTypes";

let tooltip: HTMLDivElement | null = null;

export function ensureTooltip(): void {
	if (tooltip) return;
	tooltip = document.createElement("div");
	tooltip.style.position = "fixed";
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

function showTooltipForNode(node: HTMLElement, html: string): void {
	ensureTooltip();
	if (!tooltip) return;

	tooltip.innerHTML = html;
	tooltip.style.display = "block";

	// compute after display so offsetWidth/offsetHeight are valid
	const rect = node.getBoundingClientRect();

	let x = rect.left;
	let y = rect.bottom + 6; // sits *under* the text

	// Prevent off-screen overflow
	if (x + tooltip.offsetWidth > window.innerWidth) {
		x = window.innerWidth - tooltip.offsetWidth - 10;
	}
	if (y + tooltip.offsetHeight > window.innerHeight) {
		y = rect.top - tooltip.offsetHeight - 6; // show above if not enough space below
	}

	tooltip.style.left = `${x}px`;
	tooltip.style.top = `${y}px`;
}

export function hideTooltip(): void {
	if (tooltip) {
		tooltip.style.display = "none";
	}
}

function buildTooltipHtml(span: HighlightSpan): string {
	const type = escapeHtml(span.type ?? "unknown");
	const confidence =
		typeof span.confidence === "number"
			? `${Math.round(span.confidence * 100)}%`
			: "n/a";
	const rationale = escapeHtml(span.rationale ?? "No rationale provided.");
	return `
		<div><strong>Type:</strong> ${type}</div>
		<div><strong>Confidence:</strong> ${confidence}</div>
		<div><strong>Rationale:</strong> ${rationale}</div>
	`;
}

function escapeHtml(value: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;"
	};
	return value.replace(/[&<>'\"]/g, ch => map[ch] ?? ch);
}

export function attachTooltip(node: HTMLElement, span: HighlightSpan): void {
	node.addEventListener("mouseenter", () => {
		const html = buildTooltipHtml(span);
		showTooltipForNode(node, html);
	});

	node.addEventListener("mouseleave", hideTooltip);
}
