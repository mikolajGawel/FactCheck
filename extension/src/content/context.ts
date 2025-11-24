import { createTextSnapshot } from "./textSnapshot";
import { HIGHLIGHT_IGNORE_SELECTOR } from "./constants";
import { getArticleNodes, findArticleTitle } from "./articleDetection";
import { normalizeText } from "./textProcessing";
import { HighlightContext, HighlightSource } from "../types/highlightTypes";

// These tags never contribute to canonical text (see docs) but inflate payload size,
// so we physically remove them before sending HTML to the backend.
// Note: the following tags (including <script>, <style>, <link>, <meta>) are already
// ignored during text extraction on both frontend and backend, so removing them from
// the serialized payload does not affect offsets or canonical text.
const PAYLOAD_STRIP_SELECTORS = ["form", "img", "image", "video", "picture", "script", "style", "link", "meta"];
const PAYLOAD_STRIP_QUERY = PAYLOAD_STRIP_SELECTORS.join(", ");

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
		html: serializeContextHtml(root),
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
		html: serializeContextHtml(node),
		pointers: snapshot.pointers,
		ignoreSelector: HIGHLIGHT_IGNORE_SELECTOR,
		title: findArticleTitle(node) ?? null
	};
}

function getRootElement(): HTMLElement {
	return (document.body ?? document.documentElement) as HTMLElement;
}

function serializeContextHtml(root: HTMLElement): string {
	const clone = root.cloneNode(true) as HTMLElement;
	if (PAYLOAD_STRIP_QUERY) {
		clone.querySelectorAll(PAYLOAD_STRIP_QUERY).forEach(node => node.remove());
	}
	return clone.outerHTML;
}
