import { isLikelyTeaser, filterOutNested } from "./domUtils";

/**
 * Check if current page is a TVN24 domain
 */
export function isTvn24Page(): boolean {
	try {
		return typeof location !== "undefined" && !!location.hostname && location.hostname.includes("tvn24");
	} catch {
		return false;
	}
}

/**
 * TVN24-specific article node detection
 * Prefers the document <main> as the article root
 */
export function getTvn24ArticleNodes(): HTMLElement[] | null {
	if (!isTvn24Page()) return null;

	const main = document.querySelector<HTMLElement>("main");
	if (main && !isLikelyTeaser(main)) {
		return [main];
	}
	return null;
}

/**
 * Gazeta.pl-specific selectors
 */
const GAZETA_SELECTORS = [".bottom_section", "._articleContent", ".article_content", "[data-starea-articletype]"] as const;

/**
 * Gazeta.pl-specific article node detection
 */
export function getGazetaArticleNodes(): HTMLElement[] | null {
	for (const selector of GAZETA_SELECTORS) {
		const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(el => !isLikelyTeaser(el));
		const topNodes = filterOutNested(nodes);
		if (topNodes.length > 0) return topNodes;
	}
	return null;
}

/**
 * Common article body selectors used across many sites
 */
export const COMMON_ARTICLE_BODY_SELECTORS = ".articleBody, .article-body, [class*='articleBody']";
