import { createTextSnapshot } from "../textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "../constants";
import { ArticleSummary } from "../../types/highlightTypes";

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
	const matchedHandlers = siteRegistry.findMatches();
	for (const matchedHandler of matchedHandlers) {
		const nodes = matchedHandler.detect();
		if (nodes) return nodes;
	}

	console.warn("No article nodes detected on this page.");
	return [];
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
