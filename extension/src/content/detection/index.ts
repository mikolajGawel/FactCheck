import { createTextSnapshot } from "../textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "../constants";
import { ArticleSummary } from "../../types/highlightTypes";

import { isLikelyTeaser, filterOutNested } from "./domUtils";
import { getTvn24ArticleNodes, getGazetaArticleNodes, COMMON_ARTICLE_BODY_SELECTORS } from "./siteSelectors";
import { countSentences, createSnippet } from "./textUtils";
import { findArticleTitle, generateTitle, createTitleState } from "./titleUtils";

// Re-export for backward compatibility
export { findArticleTitle } from "./titleUtils";

const MINIMAL_SENTENCES_COUNT = 4;

/**
 * Find article nodes in the current page
 * Uses site-specific heuristics and fallback strategies
 */
export function getArticleNodes(): HTMLElement[] {
	// 1. Site-specific detection (TVN24)
	const tvn24Nodes = getTvn24ArticleNodes();
	if (tvn24Nodes) return tvn24Nodes;

	// 2. Standard <article> elements (excluding teasers)
	const articles = Array.from(document.querySelectorAll<HTMLElement>("article")).filter(el => !isLikelyTeaser(el));
	const topArticles = filterOutNested(articles);
	if (topArticles.length > 0) return topArticles;

	// 3. Common article body classes
	const articleBodies = Array.from(document.querySelectorAll<HTMLElement>(COMMON_ARTICLE_BODY_SELECTORS)).filter(
		el => !isLikelyTeaser(el)
	);
	const topArticleBodies = filterOutNested(articleBodies);
	if (topArticleBodies.length > 0) return topArticleBodies;

	// 4. Site-specific detection (Gazeta.pl)
	const gazetaNodes = getGazetaArticleNodes();
	if (gazetaNodes) return gazetaNodes;

	// 5. Fallback: large blocks with many paragraphs
	return findLargeTextBlocks();
}

/**
 * Fallback heuristic: find large div/section blocks with substantial content
 */
function findLargeTextBlocks(): HTMLElement[] {
	const candidates = document.querySelectorAll<HTMLElement>("div, section");

	const best = Array.from(candidates)
		.filter(el => !isLikelyTeaser(el))
		.find(el => {
			const paragraphs = el.querySelectorAll("p").length;
			const textLength = el.textContent?.length ?? 0;
			return paragraphs > 5 && textLength > 800;
		});

	return best ? [best] : [];
}

/**
 * Collect article summaries from the current page
 */
export function collectArticles(): ArticleSummary[] {
	const nodes = getArticleNodes();
	const results: ArticleSummary[] = [];
	const titleState = createTitleState();

	nodes.forEach((node, idx) => {
		const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
		const text = snapshot.text ?? "";
		const sentences = countSentences(text);

		// Skip fragments that are too short
		if (sentences < MINIMAL_SENTENCES_COUNT) {
			return;
		}

		const foundTitle = findArticleTitle(node);
		const title = generateTitle(foundTitle, idx, titleState);
		const snippet = createSnippet(text);

		results.push({ id: idx, title, snippet });
	});

	return results;
}
