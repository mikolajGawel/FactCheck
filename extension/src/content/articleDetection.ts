import { createTextSnapshot } from "./textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "./constants";
import { ArticleSummary } from "../types/highlightTypes";

export function getArticleNodes(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>("article"));
}

export function findArticleTitle(articleNode: HTMLElement): string | null {
	for (let level = 1; level <= 6; level += 1) {
		const el = articleNode.querySelector<HTMLElement>(`h${level}`);
		if (el) {
			const value = el.innerText.trim();
			if (value) {
				return value;
			}
		}
	}

	const aria = articleNode.getAttribute("aria-label");
	if (aria) return aria.trim();

	const dataTitle = articleNode.getAttribute("data-title");
	if (dataTitle) return dataTitle.trim();

	const strong = articleNode.querySelector<HTMLElement>("strong, b");
	if (strong) {
		const value = strong.innerText.trim();
		if (value) {
			return value;
		}
	}

	return null;
}

export function collectArticles(): ArticleSummary[] {
	return getArticleNodes().map((node, idx) => {
		const title = findArticleTitle(node) ?? `Article ${idx + 1}`;
		const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
		const snippet = snapshot.text.slice(0, 200).replace(/\s+/g, " ");
		return { id: idx, title, snippet };
	});
}
