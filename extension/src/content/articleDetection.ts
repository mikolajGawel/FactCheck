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
const minimalSentencesInArticle = 4;
export function collectArticles(): ArticleSummary[] {
	const nodes = getArticleNodes();
	const out: ArticleSummary[] = [];
	nodes.forEach((node, idx) => {
		const title = findArticleTitle(node) ?? `Article ${idx + 1}`;
		const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
		const text = snapshot.text || "";
		const sentences = countSentences(text);
		// Only include articles with at least 4 sentences
		if (minimalSentencesInArticle >= 4) {
			const snippet = text.slice(0, 200).replace(/\s+/g, " ");
			out.push({ id: idx, title, snippet });
		}
	});
	return out;
}

function countSentences(text: string): number {
	if (!text || !text.trim()) return 0;
	try {
		const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
		let m: RegExpExecArray | null;
		let c = 0;
		while ((m = re.exec(text)) !== null) {
			if (m[0].trim()) c += 1;
		}
		return c;
	} catch (e) {
		return 0;
	}
}
