export const DEFAULT_NOISE_SELECTORS = [
	"script",
	"style",
	"nav",
	"aside",
	"footer",
	"header",
	"figure",
	"iframe",
	"noscript",
	"template",
	"button",
	"time",
	"form",
	"img",
	"image",
	"video",
	"picture",
	"link",
	"meta"
];

export const INTERACTIVE_SKIP_SELECTORS = ["a", "button", "label", "input", "textarea", "select"];

const NBSP_REGEX = /\u00a0/g;
const MULTISPACE_REGEX = /[ \t\f\v]+/g;
const MULTILINE_REGEX = /\s*\n+\s*/g;

export interface NormalizeTextOptions {
	collapseNewlines?: boolean;
	trim?: boolean;
}

export function normalizeText(raw: string, options: NormalizeTextOptions = {}): string {
	if (!raw) return "";
	const { collapseNewlines = true, trim = true } = options;
	let normalized = String(raw).replace(/\r\n?/g, "\n").replace(NBSP_REGEX, " ");

	if (collapseNewlines) {
		normalized = normalized.replace(MULTILINE_REGEX, " ");
	}

	normalized = normalized.replace(MULTISPACE_REGEX, " ").replace(/ {2,}/g, " ");

	return trim ? normalized.trim() : normalized;
}

export interface TextNodeEntry {
	node: Text;
	text: string;
	start: number;
	end: number;
}

export interface TextWalkerOptions {
	skipSelector?: string;
	skipEmpty?: boolean;
}

export function buildTextNodeMap(root: ParentNode, options: TextWalkerOptions = {}): TextNodeEntry[] {
	const { skipSelector, skipEmpty = true } = options;
	const doc = root.ownerDocument ?? (typeof document !== "undefined" ? document : undefined);
	if (!doc?.createTreeWalker) {
		throw new Error("Text node walker requires a DOM Document context");
	}

	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
	const entries: TextNodeEntry[] = [];
	let offset = 0;

	while (walker.nextNode()) {
		const node = walker.currentNode as Text;
		if (skipSelector && node.parentElement?.closest(skipSelector)) {
			continue;
		}

		const text = node.textContent ?? "";
		if (skipEmpty && !text.trim()) {
			continue;
		}

		entries.push({
			node,
			text,
			start: offset,
			end: offset + text.length
		});

		offset += text.length;
	}

	return entries;
}
