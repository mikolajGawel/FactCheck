import { isLikelyTeaser, filterOutNested } from "../domUtils";
import { SiteHandler, SiteHandlerRegistry, SelectorBasedHandler } from "./siteRegistry";

/**
 * Custom handler for TVN24 with main tag preference
 */
class Tvn24Handler implements SiteHandler {
	readonly id = "tvn24";

	matches(): boolean {
		try {
			return typeof location !== "undefined" && !!location.hostname && location.hostname.includes("tvn24");
		} catch {
			return false;
		}
	}

	detect(): HTMLElement[] | null {
		const main = document.querySelector<HTMLElement>("main");
		if (main && !isLikelyTeaser(main)) {
			return [main];
		}
		return null;
	}
}

/**
 * Create and register all built-in site handlers
 */
export function createDefaultRegistry(): SiteHandlerRegistry {
	const registry = new SiteHandlerRegistry();

	// TVN24 - custom handler for <main> tag preference
	registry.register(new Tvn24Handler());

	// Gazeta.pl - selector-based handler
	registry.register(
		new SelectorBasedHandler(
			"gazeta.pl",
			"gazeta.pl",
			{
				selectors: [".bottom_section", "._articleContent", ".article_content", "[data-starea-articletype]"],
				teaserMaxLength: 600
			},
			isLikelyTeaser,
			filterOutNested
		)
	);

	// Common article body selectors (fallback for many sites)
	registry.register(
		new SelectorBasedHandler(
			"generic-article-body",
			/.*/,
			{
				selectors: [".articleBody", ".article-body", "[class*='articleBody']"],
				teaserMaxLength: 600
			},
			isLikelyTeaser,
			filterOutNested
		)
	);

	// Standard HTML5 <article> tag (most generic, usually last)
	registry.register(
		new SelectorBasedHandler(
			"html5-article",
			/.*/,
			{
				selectors: ["article"],
				teaserMaxLength: 600
			},
			isLikelyTeaser,
			filterOutNested
		)
	);

	return registry;
}
