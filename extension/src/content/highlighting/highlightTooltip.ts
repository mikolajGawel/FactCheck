import type { HighlightSpan } from "../../types/highlightTypes";

let tooltip: HTMLDivElement | null = null;
let tooltipStyleEl: HTMLStyleElement | null = null;
const TOOLTIP_CSS_FALLBACK = `
.fc-tooltip {
  position: fixed;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  border-radius: 6px;
  font-size: 13px;
  pointer-events: none;
  z-index: 999999;
  display: none;
  max-width: calc(100vw - 30px);
  word-wrap: break-word;
  line-height: 1.3;
  box-sizing: border-box;
}

.fc-tooltip--visible {
  display: block;
}

/* small offset helper in case of very small screens */
.fc-tooltip--right-edge {
  right: 10px !important;
  left: auto !important;
}


.fc-tooltip h5 {
    font-size: 1rem;
}

.fc-tooltip p {
    max-width: 45ch;
    color: rgba(255, 255, 255, 0.8);
}`;

export function ensureTooltip(): void {
	if (tooltip) return;

	tooltipStyleEl = document.createElement("style");
	tooltipStyleEl.setAttribute("data-factcheck", "tooltip-styles");
	tooltipStyleEl.textContent = TOOLTIP_CSS_FALLBACK;
	document.body.appendChild(tooltipStyleEl);

	tooltip = document.createElement("div");
	tooltip.className = "fc-tooltip";
	document.body.appendChild(tooltip);
}

function showTooltipForNode(node: HTMLElement, html: string): void {
	ensureTooltip();
	if (!tooltip) return;

	tooltip.innerHTML = html;
	// make visible so offsetWidth/offsetHeight are correct for positioning
	tooltip.classList.add("fc-tooltip--visible");
	tooltip.classList.remove("fc-tooltip--right-edge");

	const rect = node.getBoundingClientRect();

	let x = rect.left;
	let y = rect.bottom + 6;

	// ensure width measurement is up-to-date
	const tw = tooltip.offsetWidth;
	const th = tooltip.offsetHeight;

	if (x + tw > window.innerWidth) {
		x = window.innerWidth - tw - 10;
		// small helper class to enforce right edge when necessary
		tooltip.classList.add("fc-tooltip--right-edge");
	}
	if (y + th > window.innerHeight) {
		y = rect.top - th - 6;
	}

	tooltip.style.left = `${x}px`;
	tooltip.style.top = `${y}px`;
}

export function hideTooltip(): void {
	if (tooltip) {
		tooltip.classList.remove("fc-tooltip--visible");
		tooltip.classList.remove("fc-tooltip--right-edge");
	}
}

function buildTooltipHtml(span: HighlightSpan): string {
	const type = escapeHtml(span.type ?? "unknown");
	const confidence = typeof span.confidence === "number" ? `${Math.round(span.confidence * 100)}%` : "n/a";
	const rationale = escapeHtml(span.rationale ?? "No rationale provided.");

	let typeInPolish = type;
	switch (type.toLowerCase()) {
		case "fact":
			typeInPolish = "Fakt";
			break;
		case "opinion":
			typeInPolish = "Opina";
			break;
		case "uncertain":
			typeInPolish = "Niepewne / Mieszane";
			break;
		default:
			typeInPolish = type;
	}

	return `
        <h5>${typeInPolish}</h5>
		<p>${rationale}</p>
		<p><em>Pewność:</em> ${confidence}</p>
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
