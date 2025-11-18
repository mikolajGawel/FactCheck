"use strict";

// ---- KONFIGURACJA KOLORÓW ----
const TYPE_COLORS = {
	fact: "#c8f7c5", // zielony (fakt)
	opinion: "#f7c5c5", // czerwony (opinia)
	uncertain: "#f7e9c5" // żółty (niepewne)
};

// ---- TOOLTIP (Przechowywany globalnie) ----
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

	// Pozycjonowanie
	let x = event.pageX + 10;
	let y = event.pageY + 10;

	if (x + tooltip.offsetWidth > window.innerWidth) {
		x = event.pageX - tooltip.offsetWidth - 10;
	}
	if (y + tooltip.offsetHeight > window.innerHeight) {
		y = window.innerHeight - tooltip.offsetHeight - 10;
	}

	tooltip.style.left = x + "px";
	tooltip.style.top = y + "px";
	tooltip.style.display = "block";
}

function hideTooltip() {
	if (tooltip) tooltip.style.display = "none";
}

/**
 * Usuwa podświetlenia z tekstu.
 */
export function removeHighlights() {
	const highlightedSpans = document.querySelectorAll("span[data-type]");
	highlightedSpans.forEach(span => {
		span.replaceWith(document.createTextNode(span.textContent));
	});
	if (tooltip) tooltip.style.display = "none";
}

/**
 * Tworzy mapę węzłów tekstowych na stronie.
 * MUSI BYĆ WYWOŁANA PO KAŻDEJ MODYFIKACJI DOM.
 */
function createNodeMap() {
	const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);

	const nodes = [];
	let offset = 0;

	while (walker.nextNode()) {
		const node = walker.currentNode;

		// Ignorowanie skryptów/stylów/ukrytych/pustych
		if (
			node.textContent.trim().length === 0 ||
			node.parentNode.closest('script, style, [role="presentation"], .dSRTqPpuAk')
		) {
			continue;
		}

		const length = node.textContent.length;
		nodes.push({
			node,
			start: offset,
			end: offset + length
		});
		offset += length;
	}
	return { nodes, totalLength: offset };
}

/**
 * Podświetla tekst na stronie na podstawie dostarczonych danych JSON (spans).
 * @param {object} result Obiekt zawierający klucz 'spans'.
 */
export function highlightText(result, _context) {
	if (!result || !result.spans) return;

	// 1. Zaczynamy od czystej mapy
	removeHighlights();
	createTooltip();

	// Sortowanie spanów według pozycji początkowej, aby przetwarzać je po kolei
	const sortedSpans = result.spans.sort((a, b) => a.start - b.start);

	// Iterujemy przez KAŻDY span, regenerując mapę za każdym razem, gdy jest to konieczne
	sortedSpans.forEach((spanData, index) => {
		// Regeneracja mapy po poprzednim podświetleniu
		const { nodes } = createNodeMap();

		const { text, type, rationale, confidence } = spanData;
		const color = TYPE_COLORS[type] || "#ddd";

		let currentGlobalOffset = spanData.start;
		const endGlobal = spanData.end;

		// 2. Iteracja przez węzły, aby podświetlić fragment
		for (const nodeMap of nodes) {
			if (nodeMap.end <= currentGlobalOffset) {
				continue; // Zaczyna się za węzłem
			}
			if (currentGlobalOffset >= endGlobal) {
				break; // Już skończyliśmy podświetlać
			}

			// Obliczanie granic podświetlenia w bieżącym węźle
			const localStart = Math.max(0, currentGlobalOffset - nodeMap.start);
			const localEnd = Math.min(nodeMap.node.textContent.length, endGlobal - nodeMap.start);

			if (localStart >= localEnd) {
				continue;
			}

			const originalNode = nodeMap.node;
			const parent = originalNode.parentNode;
			if (!parent) continue;

			// 1. Tekst przed
			const before = originalNode.textContent.slice(0, localStart);
			if (before.length > 0) parent.insertBefore(document.createTextNode(before), originalNode);

			// 2. Tekst do podświetlenia (tworzenie span)
			const match = originalNode.textContent.slice(localStart, localEnd);
			const spanEl = document.createElement("span");
			spanEl.textContent = match;
			spanEl.style.backgroundColor = color;
			spanEl.style.cursor = "pointer";

			// Ustawienie danych
			spanEl.dataset.type = type;
			spanEl.dataset.confidence = confidence;
			spanEl.dataset.rationale = rationale;
			spanEl.dataset.originalIndex = index;

			// Ustawienie tooltipa
			spanEl.addEventListener("mouseenter", e => {
				showTooltip(
					e,
					`
          <b>Typ:</b> ${type} (${(confidence * 100).toFixed(0)}%)<br>
          <b>Pewność:</b> ${confidence}<br>
          <b>Uzasadnienie:</b> ${rationale}
        `
				);
			});
			spanEl.addEventListener("mouseleave", hideTooltip);

			parent.insertBefore(spanEl, originalNode);

			// 3. Tekst po
			const after = originalNode.textContent.slice(localEnd);
			if (after.length > 0) parent.insertBefore(document.createTextNode(after), originalNode);

			// Usunięcie starego węzła
			parent.removeChild(originalNode);

			// Kluczowa aktualizacja: ustawiamy globalny offset na koniec podświetlonego fragmentu
			currentGlobalOffset = nodeMap.start + localEnd;

			// Jeśli dotarliśmy do końca naszego spana, możemy przerwać
			if (currentGlobalOffset >= endGlobal) {
				break;
			}
		}
	});
}
