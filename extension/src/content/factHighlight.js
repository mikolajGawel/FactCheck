"use strict";

// ---- KONFIGURACJA KOLORÓW ----
const TYPE_COLORS = {
  fact: "#c8f7c5",       // zielony
  opinion: "#f7c5c5",    // czerwony
  uncertain: "#f7e9c5",  // żółty
};

// ---- TOOLTIP ----
let tooltip;

function createTooltip() {
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

function showTooltip(event, text) {
  createTooltip();
  tooltip.innerHTML = text;
  tooltip.style.left = event.pageX + 10 + "px";
  tooltip.style.top = event.pageY + 10 + "px";
  tooltip.style.display = "block";
}

function hideTooltip() {
  if (tooltip) tooltip.style.display = "none";
}

// ---- GŁÓWNA FUNKCJA HIGHLIGHT ----
export function highlightText(result) {
  if (!result || !result.spans) return;
  createTooltip();

  result.spans.forEach(span => {
    const { text, type, rationale, confidence } = span;
    const color = TYPE_COLORS[type] || "#ddd";

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const idx = node.textContent.indexOf(text);
      if (idx !== -1) {
        const before = node.textContent.slice(0, idx);
        const match = node.textContent.slice(idx, idx + text.length);
        const after = node.textContent.slice(idx + text.length);

        const spanEl = document.createElement("span");
        spanEl.textContent = match;
        spanEl.style.backgroundColor = color;
        spanEl.style.cursor = "pointer";

        spanEl.addEventListener("mousemove", (e) => {
          showTooltip(e, `
            <b>Type:</b> ${type}<br>
            <b>Confidence:</b> ${confidence}<br>
            <b>Rationale:</b> ${rationale}
          `);
        });
        spanEl.addEventListener("mouseleave", hideTooltip);

        const parent = node.parentNode;
        parent.insertBefore(document.createTextNode(before), node);
        parent.insertBefore(spanEl, node);
        parent.insertBefore(document.createTextNode(after), node);
        parent.removeChild(node);
        break;
      }
    }
  });
}

// ---- FUNKCJA DO RESETU HIGHLIGHTÓW (opcjonalnie) ----
export function removeHighlights() {
  const spans = document.querySelectorAll("span");
  spans.forEach(span => {
    if (Object.values(TYPE_COLORS).includes(span.style.backgroundColor)) {
      span.replaceWith(document.createTextNode(span.textContent));
    }
  });
  if (tooltip) tooltip.style.display = "none";
}
