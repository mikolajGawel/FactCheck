import { DEFAULT_NOISE_SELECTORS, normalizeText } from "../../../shared/src/textProcessing";

export type HighlightSource = "article" | "document" | "custom";

export interface ArticleSummary {
	id: number;
	title: string;
	snippet: string;
}

export interface TextPointer {
	startNode: Text;
	startOffset: number;
	endNode: Text;
	endOffset: number;
}

export interface HighlightContext {
	articleId: number | null;
	source: HighlightSource;
	root: HTMLElement;
	text: string;
	pointers: TextPointer[];
	ignoreSelector: string;
	title?: string | null;
}

const EXTRA_IGNORED_SELECTORS = ["[data-factcheck-ignore]", "[hidden]", "[aria-hidden='true']"];

export const HIGHLIGHT_IGNORE_SELECTOR = [...new Set([...DEFAULT_NOISE_SELECTORS, ...EXTRA_IGNORED_SELECTORS])].join(", ");

export function collectArticles(): ArticleSummary[] {
	return getArticleNodes().map((node, idx) => {
		const title = findArticleTitle(node) ?? `Article ${idx + 1}`;
		const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
		const snippet = snapshot.text.slice(0, 200).replace(/\s+/g, " ");
		return { id: idx, title, snippet };
	});
}

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
		pointers: [],
		ignoreSelector: HIGHLIGHT_IGNORE_SELECTOR,
		title: document.title ?? null
	};
}

function createContextFromNode(node: HTMLElement, articleId: number, source: HighlightSource): HighlightContext {
	const snapshot = createTextSnapshot(node, HIGHLIGHT_IGNORE_SELECTOR);
	return {
		articleId,
		source,
		root: node,
		text: snapshot.text,
		pointers: snapshot.pointers,
		ignoreSelector: HIGHLIGHT_IGNORE_SELECTOR,
		title: findArticleTitle(node) ?? null
	};
}

interface TextSnapshot {
	text: string;
	pointers: TextPointer[];
}

interface TextPosition {
	node: Text;
	offset: number;
}

interface PendingWhitespace {
	start: TextPosition;
	end: TextPosition;
}

function createTextSnapshot(root: HTMLElement, ignoreSelector: string): TextSnapshot {
	const doc = root.ownerDocument ?? document;
	const filter: NodeFilter = {
		acceptNode: node => {
			if (!(node instanceof Text)) {
				return NodeFilter.FILTER_SKIP;
			}
			const parent = node.parentElement;
			if (!parent) return NodeFilter.FILTER_SKIP;
			if (ignoreSelector && parent.closest(ignoreSelector)) {
				return NodeFilter.FILTER_REJECT;
			}
			return NodeFilter.FILTER_ACCEPT;
		}
	};

	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter);
	const textParts: string[] = [];
	const pointers: TextPointer[] = [];
	let pendingSpace: PendingWhitespace | null = null;
	let hasOutput = false;

	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		const content = node.textContent ?? "";
		for (let idx = 0; idx < content.length; idx += 1) {
			const char = content[idx];
			if (isWhitespace(char)) {
				if (!hasOutput) {
					continue;
				}
				const position: TextPosition = { node, offset: idx + 1 };
				if (!pendingSpace) {
					pendingSpace = {
						start: { node, offset: idx },
						end: position
					};
				} else {
					pendingSpace.end = position;
				}
				continue;
			}

			if (pendingSpace) {
				textParts.push(" ");
				pointers.push({
					startNode: pendingSpace.start.node,
					startOffset: pendingSpace.start.offset,
					endNode: pendingSpace.end.node,
					endOffset: pendingSpace.end.offset
				});
				pendingSpace = null;
			}

			textParts.push(char);
			pointers.push({
				startNode: node,
				startOffset: idx,
				endNode: node,
				endOffset: idx + 1
			});
			hasOutput = true;
		}
	}

	return {
		text: textParts.join(""),
		pointers
	};
}

function isWhitespace(char: string): boolean {
	return /[\s\u00a0]/.test(char);
}

function getRootElement(): HTMLElement {
	return (document.body ?? document.documentElement) as HTMLElement;
}

function getArticleNodes(): HTMLElement[] {
	return Array.from(document.querySelectorAll<HTMLElement>("article"));
}

function findArticleTitle(articleNode: HTMLElement): string | null {
	for (let level = 1; level <= 6; level += 1) {
		const el = articleNode.querySelector<HTMLElement>(`h${level}`);
		if (el) {
			const value = el.innerText.trim();
			if (value) {
				return value;
			}
		}
	}

	const aria = articleNode.getAttribute("aria-label");
	if (aria) return aria.trim();

	const dataTitle = articleNode.getAttribute("data-title");
	if (dataTitle) return dataTitle.trim();

	const strong = articleNode.querySelector<HTMLElement>("strong, b");
	if (strong) {
		const value = strong.innerText.trim();
		if (value) {
			return value;
		}
	}

	return null;
}
