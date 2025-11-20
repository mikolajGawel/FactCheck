import { createTextSnapshot } from "./textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "./constants";
import { getArticleNodes, findArticleTitle } from "./articleDetection";
import { normalizeText } from "../../../shared/src/textProcessing";
import { HighlightContext, HighlightSource } from "../types/highlightTypes";

export function collectArticleText(articleId: number): string {
	return buildArticleContext(articleId).text;
}

export function buildArticleContext(articleId?: number): HighlightContext {
	if (typeof articleId === "number") {
		const node = getArticleNodes()[articleId];
		if (node) {
			return createContextFromNode(node, articleId, "article");
		}
	}

	return buildDocumentContext();
}

export function buildDocumentContext(): HighlightContext {
	const root = getRootElement();
	const snapshot = createTextSnapshot(root, HIGHLIGHT_IGNORE_SELECTOR);
	return {
		articleId: null,
		source: "document",
		root,
		text: snapshot.text,
		html: root.outerHTML,
		pointers: snapshot.pointers,
		ignoreSelector: HIGHLIGHT_IGNORE_SELECTOR,
		title: document.title ?? null
	};
}

export function buildCustomContext(content: string): HighlightContext {
	const root = getRootElement();
	return {
		articleId: null,
		source: "custom",
		root,
		text: normalizeText(content),
		html: content,
		pointers: [],
		ignoreSelector: HIGHLIGHT_IGNORE_SELECTOR,
		title: document.title ?? null
	};
}

export function createContextFromNode(node: HTMLElement, articleId: number, source: HighlightSource): HighlightContext {
	const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
	return {
		articleId,
		source,
		root: node,
		text: snapshot.text,
		html: node.outerHTML,
		pointers: snapshot.pointers,
		ignoreSelector: HIGHLIGHT_IGNORE_SELECTOR,
		title: findArticleTitle(node) ?? null
	};
}

function getRootElement(): HTMLElement {
	return (document.body ?? document.documentElement) as HTMLElement;
}
