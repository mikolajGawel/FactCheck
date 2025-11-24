import { toRoman } from "./textUtils";

/** Titles to ignore (site-specific noise) */
const IGNORED_TITLES = [
	"poznaj kontekst z ai" // common non-title in onet.pl
];

/**
 * Check if a title should be ignored
 */
function shouldIgnoreTitle(title: string): boolean {
	const normalized = title.trim().toLowerCase();
	return IGNORED_TITLES.some(ignored => normalized === ignored);
}

/**
 * Find article title from DOM element
 * Searches h1-h6, aria-label, and data-title attributes
 */
export function findArticleTitle(articleNode: HTMLElement): string | null {
	// Try headings h1-h6
	for (let level = 1; level <= 6; level++) {
		const el = articleNode.querySelector<HTMLElement>(`h${level}`);
		if (el) {
			const value = el.innerText.trim();
			if (value) return value;
		}
	}

	// Try aria-label
	const ariaLabel = articleNode.getAttribute("aria-label");
	if (ariaLabel) return ariaLabel.trim();

	// Try data-title
	const dataTitle = articleNode.getAttribute("data-title");
	if (dataTitle) return dataTitle.trim();

	return null;
}

export interface TitleGeneratorState {
	lastGoodTitle: string | null;
	titleCounts: Map<string, number>;
}

/**
 * Create initial title generator state
 */
export function createTitleState(): TitleGeneratorState {
	return {
		lastGoodTitle: null,
		titleCounts: new Map()
	};
}

/**
 * Generate a unique title, handling duplicates with Roman numeral suffixes
 */
export function generateTitle(foundTitle: string | null, index: number, state: TitleGeneratorState): string {
	// Valid title found
	if (foundTitle && !shouldIgnoreTitle(foundTitle)) {
		state.lastGoodTitle = foundTitle;
		const count = (state.titleCounts.get(foundTitle) ?? 0) + 1;
		state.titleCounts.set(foundTitle, count);

		return count > 1 ? `${foundTitle} — cz. ${toRoman(count)}` : foundTitle;
	}

	// Reuse last good title with part suffix
	if (state.lastGoodTitle) {
		const nextCount = (state.titleCounts.get(state.lastGoodTitle) ?? 0) + 1;
		state.titleCounts.set(state.lastGoodTitle, nextCount);
		return `${state.lastGoodTitle} — cz. ${toRoman(nextCount)}`;
	}

	// Fallback to generic title
	return `Artykuł ${index + 1}`;
}
