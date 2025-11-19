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

	// Keep original behavior; position update can be changed in a separate PR if necessary
	tooltip.style.left = `${0}px`;
	tooltip.style.top = `${0}px`;
	tooltip.style.display = "block";
}

export function hideTooltip(): void {
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
	return value.replace(/[&<>'\"]/g, ch => map[ch] ?? ch);
}

export function attachTooltip(node: HTMLElement, span: HighlightSpan): void {
	node.addEventListener("mouseenter", event => {
		const html = buildTooltipHtml(span);
		showTooltip(event as MouseEvent, html);
	});

	node.addEventListener("mouseleave", hideTooltip);
}
