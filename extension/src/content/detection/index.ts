import { createTextSnapshot } from "../textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "../constants";
import { ArticleSummary } from "../../types/highlightTypes";

import { isLikelyTeaser } from "./domUtils";
import { createDefaultRegistry } from "./sites/siteSelectors";
import { countSentences, createSnippet } from "./textUtils";
import { findArticleTitle, generateTitle, createTitleState } from "./titleUtils";

const MINIMAL_SENTENCES_COUNT = 4;

// Initialize default site handler registry
let siteRegistry = createDefaultRegistry();

/**
 * Set custom site handler registry for testing or custom configurations
 */
export function setSiteRegistry(registry: any): void {
	siteRegistry = registry;
}

/**
 * Get the current site handler registry
 */
export function getSiteRegistry(): any {
	return siteRegistry;
}

/**
 * Find article nodes in the current page
 * Uses site-specific heuristics and fallback strategies
 */
export function getArticleNodes(): HTMLElement[] {
	// Try site-specific handlers first
	const matchedHandler = siteRegistry.findMatch();
	if (matchedHandler) {
		const nodes = matchedHandler.detect();
		if (nodes) return nodes;
	}

	// Fallback: large blocks with many paragraphs
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
