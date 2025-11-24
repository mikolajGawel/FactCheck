/**
 * Site handler interface and registry for article detection
 *
 * This allows easy extension with new site-specific detection strategies.
 * Just create a new handler that implements the SiteHandler interface
 * and register it with the registry.
 */

/**
 * Configuration for CSS selectors and detection thresholds
 */
export interface SiteDetectionConfig {
	/** CSS selectors to query for article nodes */
	selectors: string[];
	/** Maximum text length threshold for teaser detection (0 = disabled) */
	teaserMaxLength?: number;
	/** Minimum paragraph count for fallback detection (0 = disabled) */
	minParagraphs?: number;
	/** Minimum text length for fallback detection (0 = disabled) */
	minTextLength?: number;
}

/**
 * Handler for site-specific article detection strategies
 */
export interface SiteHandler {
	/** Unique identifier for this handler */
	id: string;
	/** Check if this handler applies to the current page */
	matches(): boolean;
	/** Detect article nodes using site-specific logic */
	detect(): HTMLElement[] | null;
}

/**
 * Simple selector-based site handler
 * Useful for sites with predictable CSS classes/IDs
 */
export class SelectorBasedHandler implements SiteHandler {
	constructor(
		readonly id: string,
		readonly domainPattern: RegExp | string,
		readonly config: SiteDetectionConfig,
		readonly isLikelyTeaser: (el: HTMLElement) => boolean,
		readonly filterOutNested: (nodes: HTMLElement[]) => HTMLElement[]
	) {}

	matches(): boolean {
		try {
			const hostname = typeof location !== "undefined" ? location.hostname : "";
			if (typeof this.domainPattern === "string") {
				return hostname.includes(this.domainPattern);
			}
			return this.domainPattern.test(hostname);
		} catch {
			return false;
		}
	}

	detect(): HTMLElement[] | null {
		for (const selector of this.config.selectors) {
			const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
				el => !this.isLikelyTeaser(el)
			);
			const filtered = this.filterOutNested(nodes);
			if (filtered.length > 0) return filtered;
		}
		return null;
	}
}

/**
 * Registry for managing site-specific handlers
 */
export class SiteHandlerRegistry {
	private handlers: SiteHandler[] = [];

	/**
	 * Register a new site handler
	 */
	register(handler: SiteHandler): void {
		this.handlers.push(handler);
	}

	/**
	 * Find the first matching handler for the current page
	 */
	findMatch(): SiteHandler | null {
		return this.handlers.find(h => h.matches()) ?? null;
	}

	/**
	 * Get all registered handlers
	 */
	getHandlers(): SiteHandler[] {
		return [...this.handlers];
	}

	/**
	 * Clear all handlers
	 */
	clear(): void {
		this.handlers = [];
	}

	/**
	 * Get handler count
	 */
	get size(): number {
		return this.handlers.length;
	}
}
