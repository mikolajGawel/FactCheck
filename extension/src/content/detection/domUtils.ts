/**
 * DOM utility functions for article detection
 */

/**
 * Remove nodes that are contained inside other candidate nodes
 */
export function filterOutNested(nodes: HTMLElement[]): HTMLElement[] {
	return nodes.filter(n => !nodes.some(other => other !== n && other.contains(n)));
}

/**
 * Check if element looks like a "teaser card with link" rather than a real article
 */
export function isLikelyTeaser(el: HTMLElement): boolean {
	// Case 1: The node itself is a link
	if (el.tagName === "A" || el.hasAttribute("href")) {
		return true;
	}

	// Case 2: Contains exactly 1 link AND that link's text is ≥ 90% of total text
	// → the whole "article" is just one big clickable card
	const links = el.querySelectorAll("a");
	if (links.length === 1) {
		const link = links[0] as HTMLAnchorElement;
		const linkTextLen = link.textContent?.length ?? 0;
		const totalTextLen = el.textContent?.length ?? 0;
		if (totalTextLen > 0 && linkTextLen / totalTextLen >= 0.9) {
			return true;
		}
	}

	// Case 3: Contains few links, but text is short (e.g. "Read more", social buttons)
	// → still probably a teaser
	if (links.length >= 1 && links.length <= 8) {
		const totalTextLen = el.textContent?.length ?? 0;
		if (totalTextLen < 600) {
			return true;
		}
	}

	return false;
}
