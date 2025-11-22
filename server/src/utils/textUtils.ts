import * as cheerio from "cheerio";
import { normalizeText, DEFAULT_NOISE_SELECTORS } from "./textProcessing.js";

// --- Konfiguracja ---

const BLOCK_TAGS = new Set([
	"address", "article", "aside", "blockquote", "dd", "div", "dl", "dt", "fieldset",
	"figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
	"header", "hr", "li", "main", "nav", "noscript", "ol", "p", "pre", "section",
	"table", "tfoot",	"ul", "video", "br"
]);

const IGNORED_TAGS = new Set([
	...DEFAULT_NOISE_SELECTORS,
	"script", "style", "meta", "head", "link", "noscript"
]);

// --- Typy ---

export interface TextBlock {
	text: string;
	path: string[];
	isHeader: boolean;
	skipAI?: boolean;
}

export interface Sentence {
	id: number;
	text: string;
	start: number;
	end: number;
	skipAI?: boolean;
}

// --- Nowe: lista skrótów chronionych przed dzieleniem ---

const PROTECTED_ABBREVIATIONS = [
	"dr", "inż", "mgr", "prof", "hab", "hab\\.", "hab\\", "dot", "s", "ul", "al", "ks", "pl", "ppłk", "płk", "gen", "mjr", "por", "ppor", "kpt", "st", "plk", "św", "r","tyś","tys", "mln", "mld","oprac","prok"
];

// --- Funkcje zabezpieczające kropki przed dzieleniem ---

function protectDots(text: string): string {
	let result = text;

	// 1. Skróty: dr. → dr§
	for (const abbr of PROTECTED_ABBREVIATIONS) {
	// specjalna logika dla "r." tak nie dało sie inaczej
	if (abbr === "r") {
		result = result.replace(/\br\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/g, "r."); 
		result = result.replace(/\br\.(?=\s+[^A-ZĄĆĘŁŃÓŚŹŻ])/g, "r§");
		continue;
	}


		const re = new RegExp(`\\b${abbr}\\.(?=\\s|$)`, "gi");
		result = result.replace(re, m => m.slice(0, -1) + "§");
	}

	// 2. Godziny / liczby: 8.20 → 8§20
	result = result.replace(/(\d)\.(\d)/g, "$1§$2");

	return result;
}

function restoreProtectedDots(text: string): string {
	return text.replace(/§/g, ".");
}

// --- Eksportowane funkcje ---

export function normalizeArticleText(raw: string) {
	return normalizeText(raw);
}

export function limitSentences<T>(sentences: T[], maxCount?: number) {
	if (!maxCount || sentences.length <= maxCount) return sentences;
	return sentences.slice(0, maxCount);
}

export function parseHtmlToBlocks(html: string): TextBlock[] {
	const $ = cheerio.load(html);
	const blocks: TextBlock[] = [];

	function traverse(node: any, path: string[], insideHeader: boolean, skipAIForNode = false) {
		if (node.type === "text") {
			const text = $(node).text();
			const normalized = normalizeText(text, { trim: false });

			if (normalized.length > 0) {
				blocks.push({
					text: normalized,
					path: [...path],
					isHeader: insideHeader,
					skipAI: skipAIForNode
				});
			}
			return;
		}

		if (node.type === "tag") {
			const tagName = (node.name || "").toLowerCase();
			if (IGNORED_TAGS.has(tagName)) return;
			if (tagName === "br") return;

			// Ignore <a> tags that are not inside a paragraph (`<p>`).
			// Only allow traversing anchors when their parent or grandparent is a <p>.
			let nextSkipAI = skipAIForNode;
			if (tagName === "a") {
				const parentTag = path.length ? getTagNameFromPathEntry(path[path.length - 1]) : "";
				const grandParentTag = path.length > 1 ? getTagNameFromPathEntry(path[path.length - 2]) : "";
				if (parentTag !== "p" && grandParentTag !== "p") {
					// Mark this anchor and its children as skipped for AI, but still traverse
					nextSkipAI = true;
				}
			}

			const attribs = node.attribs || {};
			if (
				attribs["hidden"] !== undefined ||
				attribs["aria-hidden"] === "true" ||
				attribs["data-factcheck-ignore"] !== undefined
			) {
				return;
			}

			const isCurrentTagHeader = /^h[1-6]$/.test(tagName);
			const nextInsideHeader = insideHeader || isCurrentTagHeader;

			$(node).contents().each((i, child) => {
				traverse(child, [...path, `${tagName}[${i}]`], nextInsideHeader, nextSkipAI);
			});
		}
	}

	const body = $("body");
	const root = body.length > 0 ? body : $.root().children();

	root.contents().each((i, node) => traverse(node, [], false));

	return normalizeBlocks(blocks);
}

function normalizeBlocks(rawBlocks: TextBlock[]): TextBlock[] {
	const normalizedBlocks: TextBlock[] = [];
	let pendingSpace = false;
	let hasOutput = false;

	for (const block of rawBlocks) {
		let newText = "";
		for (const char of block.text) {
			if (/[\s\u00a0]/.test(char)) {
				if (hasOutput) {
					pendingSpace = true;
				}
			} else {
				if (pendingSpace) {
					newText += " ";
					pendingSpace = false;
				}
				newText += char;
				hasOutput = true;
			}
		}
		if (newText.length > 0) {
			normalizedBlocks.push({ ...block, text: newText });
		}
	}

	return normalizedBlocks;
}

	function getTagNameFromPathEntry(tagStr: string) {
		const match = tagStr.match(/^([a-zA-Z0-9]+)/);
		return match ? match[1].toLowerCase() : "";
	}

export function segmentSentencesWithStructure(blocks: TextBlock[], language = "en"): Sentence[] {
	if (!blocks || blocks.length === 0) return [];

	const sentences: Sentence[] = [];
	let currentBuffer = "";
	let sentenceStartIndex = 0;

	const commitSentence = (textToCommit: string) => {
		const cleaned = textToCommit.trim();
		if (cleaned) {
			const startOffset = textToCommit.indexOf(cleaned);
			sentences.push({
				id: sentences.length,
				text: cleaned,
				start: sentenceStartIndex + startOffset,
				end: sentenceStartIndex + startOffset + cleaned.length
			});
		} 
		sentenceStartIndex += textToCommit.length;
		currentBuffer = "";
	};

	// We'll keep a mapping of which ranges in `currentBuffer` come from which blocks
	let bufferBlockRanges: { start: number; end: number; skipAI?: boolean }[] = [];

	for (let i = 0; i < blocks.length; i++) {
		const currentBlock = blocks[i];
		const nextBlock = blocks[i + 1];

		const bufferOffset = currentBuffer.length;
		currentBuffer += currentBlock.text;
		bufferBlockRanges.push({ start: bufferOffset, end: bufferOffset + currentBlock.text.length, skipAI: currentBlock.skipAI });

		let hasSentenceBreakInside = /[.!?]/.test(currentBlock.text);

		let forceStructuralBreak = false;

		if (!hasSentenceBreakInside && nextBlock) {
			if (currentBlock.isHeader || nextBlock.isHeader) {
				forceStructuralBreak = true;
			} else if (isStructuralBreakSignificant(currentBlock.path, nextBlock.path)) {
				forceStructuralBreak = true;
			}
		}

		const pushSubSentences = (subSentences: { text: string; start: number; end: number }[]) => {
			for (const s of subSentences) {
				const absStart = sentenceStartIndex + s.start;
				const absEnd = sentenceStartIndex + s.end;

				// Determine whether the sentence should be skipped for AI: it's skipped
				// only when all overlapping block ranges are skipAI === true.
				const overlapping = bufferBlockRanges.filter(r => !(r.end <= s.start || r.start >= s.end));
				const skipAI = overlapping.length > 0 && overlapping.every(r => r.skipAI === true);

				sentences.push({
					id: sentences.length,
					text: s.text,
					start: absStart,
					end: absEnd,
					skipAI
				});
			}
		};

		if (hasSentenceBreakInside) {
			const subSentences = standardSegment(currentBuffer, language);
			pushSubSentences(subSentences);
			sentenceStartIndex += currentBuffer.length;
			currentBuffer = "";
			bufferBlockRanges = [];
		} else if (forceStructuralBreak) {
			// commit the whole buffer as a sentence
			const temp = currentBuffer;
			const startLocal = 0;
			const endLocal = temp.length;
			const overlapping = bufferBlockRanges.filter(r => !(r.end <= startLocal || r.start >= endLocal));
			const skipAI = overlapping.length > 0 && overlapping.every(r => r.skipAI === true);

			commitSentence(currentBuffer);
			// The commitSentence call already pushes the trimmed sentence without skipAI flag,
			// so we need to patch the last pushed sentence to carry skipAI information.
			if (sentences.length > 0) {
				sentences[sentences.length - 1].skipAI = skipAI;
			}
			bufferBlockRanges = [];
		}
	}

	if (currentBuffer.trim()) {
		const subSentences = standardSegment(currentBuffer, language);
		subSentences.forEach(s => {
			sentences.push({
				id: sentences.length,
				text: s.text,
				start: sentenceStartIndex + s.start,
				end: sentenceStartIndex + s.end
			});
		});
	}

	return sentences;
}

function isStructuralBreakSignificant(pathA: string[], pathB: string[]): boolean {
	const getTagName = (tagStr: string) => {
		const match = tagStr.match(/^([a-zA-Z0-9]+)/);
		return match ? match[1].toLowerCase() : "";
	};

	const minLen = Math.min(pathA.length, pathB.length);
	let divergeIndex = 0;

	while (divergeIndex < minLen) {
		if (pathA[divergeIndex] !== pathB[divergeIndex]) break;
		divergeIndex++;
	}

	if (divergeIndex === pathA.length || divergeIndex === pathB.length) {
		return false;
	}

	const tagA = getTagName(pathA[divergeIndex]);
	const tagB = getTagName(pathB[divergeIndex]);

	if (BLOCK_TAGS.has(tagA) || BLOCK_TAGS.has(tagB)) {
		return true;
	}

	return false;
}

// --- segmenter z ochroną kropek ---

function standardSegment(text: string, language: string) {
	const protectedText = protectDots(text);

	const res: { text: string; start: number; end: number }[] = [];

	if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter === "function") {
		const segmenter = new (Intl as any).Segmenter(language, { granularity: "sentence" });
		for (const s of segmenter.segment(protectedText)) {
			const t = restoreProtectedDots(s.segment.trim());
			if (t) res.push({ text: t, start: s.index, end: s.index + s.segment.length });
		}
	} else {
		const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
		let m;
		while ((m = re.exec(protectedText)) !== null) {
			const t = restoreProtectedDots(m[0].trim());
			if (t) res.push({ text: t, start: m.index, end: m.index + m[0].length });
		}
	}
	return res;
}
