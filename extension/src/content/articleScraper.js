/*
 * Utilities for detecting and extracting article content from a page.
 */

export function collectArticles() {
	const nodes = Array.from(document.querySelectorAll("article"));
	return nodes.map((node, idx) => {
		const title = findArticleTitle(node) || `Article ${idx + 1}`;
		const clean = extractArticleBody(node);
		const snippet = clean.slice(0, 200).replace(/\s+/g, " ");
		return { id: idx, title, snippet };
	});
}

export function collectArticleText(articleId) {
	const nodes = Array.from(document.querySelectorAll("article"));
	const node = nodes[articleId];
	if (!node) return document.documentElement.innerText.trim();
	return extractArticleBody(node);
}

export function extractArticleBody(articleNode) {
	if (!articleNode) return "";
	const clone = articleNode.cloneNode(true);
	const noiseSelectors = "aside, button, script";
	const noiseNodes = clone.querySelectorAll(noiseSelectors);
	noiseNodes.forEach(el => el.remove());
	return (clone.innerText || "").trim();
}

export function findArticleTitle(articleNode) {
	if (!articleNode) return null;
	// prefer the highest-level header
	for (let level = 1; level <= 6; level++) {
		const el = articleNode.querySelector("h" + level);
		if (el && el.innerText.trim()) return el.innerText.trim();
	}

	// fallback to aria-label or data-title or first strong/em
	const aria = articleNode.getAttribute("aria-label");
	if (aria) return aria.trim();

	const dataTitle = articleNode.getAttribute("data-title");
	if (dataTitle) return dataTitle.trim();

	const strong = articleNode.querySelector("strong, b");
	if (strong && strong.innerText.trim()) return strong.innerText.trim();

	return null;
}

export default {
	collectArticles,
	collectArticleText,
	extractArticleBody,
	findArticleTitle
};
