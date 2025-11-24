import { createTextSnapshot } from "./textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "./constants";
import { ArticleSummary } from "../types/highlightTypes";

export function getArticleNodes(): HTMLElement[] {
    // 1. Standard <article> elements (most modern sites)
    const articles = document.querySelectorAll<HTMLElement>("article");
    if (articles.length > 0) return Array.from(articles);

    // 2. Common class used by many news sites
    const articleBodies = document.querySelectorAll<HTMLElement>(".articleBody, .article-body, [class*='articleBody']");
    if (articleBodies.length > 0) return Array.from(articleBodies);

    // 3. Gazeta.pl specific (fixed typo and added common variations)
    const gazetaSelectors = [
        ".bottom_section",     // note: double "t" → corrected from "botton_section"
        "._articleContent",    // newer Gazeta.pl articles
        ".article_content",
        "[data-starea-articletype]", // another Gazeta.pl marker
    ];
    for (const selector of gazetaSelectors) {
        const nodes = document.querySelectorAll<HTMLElement>(selector);
        if (nodes.length > 0) return Array.from(nodes);
    }

    // 4. Last resort: look for elements with a lot of <p> tags (heuristic)
    const candidates = document.querySelectorAll<HTMLElement>("div, section");
    const best = Array.from(candidates).find(el => {
        const paragraphs = el.querySelectorAll("p").length;
        const textLength = el.textContent?.length || 0;
        return paragraphs > 5 && textLength > 800; // reasonable article size
    });

    return best ? [best] : [];
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
const minimalSentencesCount = 4;
export function collectArticles(): ArticleSummary[] {
	const nodes = getArticleNodes();
	const out: ArticleSummary[] = [];
	nodes.forEach((node, idx) => {
		const title = findArticleTitle(node) ?? `Article ${idx + 1}`;
		const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
		const text = snapshot.text || "";
			const sentences = countSentences(text);
			// Only include articles with at least `minimalSentencesCount` sentences
			if (sentences >= minimalSentencesCount) {
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
