import * as cheerio from "cheerio";
import { normalizeText, DEFAULT_NOISE_SELECTORS } from "./textProcessing.js";

/**
 * Text extraction and sentence segmentation for fact-checking.
 *
 * CRITICAL ALIGNMENT REQUIREMENT:
 * The text extracted here MUST exactly match what the frontend extracts via
 * extension/src/content/textSnapshot.ts to ensure highlight offsets are correct.
 *
 * Skip behavior (both sides must match):
 * - COMPLETELY SKIP (no text extraction):
 *   - Tags: script, style, nav, aside, footer, header, figure, iframe,
 *     noscript, template, button, time, form, meta, head, link, br
 *   - Elements with: [hidden], [aria-hidden="true"], [data-factcheck-ignore]
 *
 * - INCLUDE TEXT but mark skipAI=true (excluded from AI analysis only):
 *   - <a> tags outside of <p> tags (navigation links, menus, etc.)
 *   - These are included to maintain offset alignment with frontend
 */

// --- Konfiguracja ---

const BLOCK_TAGS = new Set([
	"address",
	"article",
	"aside",
	"blockquote",
	"dd",
	"div",
	"dl",
	"dt",
	"fieldset",
	"figcaption",
	"figure",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"header",
	"hr",
	"li",
	"main",
	"nav",
	"noscript",
	"ol",
	"p",
	"pre",
	"section",
	"table",
	"tfoot",
	"ul",
	"video",
	"br"
]);

const IGNORED_TAGS = new Set([...DEFAULT_NOISE_SELECTORS, "script", "style", "meta", "head", "link", "noscript"]);

// --- Typy ---

export interface ParagraphContext {
	id: string;
	depth: number;
}

export interface TextBlock {
	text: string;
	path: string[];
	isHeader: boolean;
	skipAI?: boolean;
	skipAIHard?: boolean;
	paragraphContext?: ParagraphContext;
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
	"dr",
	"inż",
	"mgr",
	"prof",
	"hab",
	"hab\\.",
	"hab\\",
	"dot",
	"s",
	"ul",
	"al",
	"ks",
	"pl",
	"ppłk",
	"płk",
	"gen",
	"mjr",
	"por",
	"ppor",
	"kpt",
	"st",
	"plk",
	"św",
	"r",
	"tyś",
	"tys",
	"mln",
	"mld",
	"oprac",
	"prok"
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
	let paragraphIdCounter = 0;

	function traverse(
		node: any,
		path: string[],
		insideHeader: boolean,
		skipAIForNode = false,
		skipAIHardForNode = false,
		paragraphContext?: ParagraphContext
	) {
		if (node.type === "text") {
			const text = $(node).text();
			const normalized = normalizeText(text, { trim: false });

			if (normalized.length > 0) {
				blocks.push({
					text: normalized,
					path: [...path],
					isHeader: insideHeader,
					skipAI: skipAIForNode,
					skipAIHard: skipAIHardForNode,
					paragraphContext
				});
			}
			return;
		}

		if (node.type === "tag") {
			const tagName = (node.name || "").toLowerCase();
			if (IGNORED_TAGS.has(tagName)) return;
			if (tagName === "br") return;

			// Handle <a> tags: include text but mark for AI skipping if outside paragraphs.
			// This ensures offset alignment - frontend includes this text, backend must too.
			// Only allow traversing anchors when they are inside a <p> element anywhere in the ancestor path.
			let nextSkipAI = skipAIForNode;
			let nextSkipAIHard = skipAIHardForNode;

			if (tagName === "a") {
				// Check if any ancestor in the path is a <p> tag
				const isInsideParagraph = path.some(pathEntry => getTagNameFromPathEntry(pathEntry) === "p");
				if (!isInsideParagraph) {
					// Mark for AI skip but INCLUDE the text (for offset alignment)
					nextSkipAI = true;
					// Also mark as "hard skip" so we can drop sentences entirely from these regions
					nextSkipAIHard = true;
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

			let nextParagraphContext: ParagraphContext | undefined = paragraphContext;
			if (tagName === "p") {
				nextParagraphContext = { id: `p-${paragraphIdCounter++}`, depth: 0 };
			} else if (paragraphContext) {
				nextParagraphContext = {
					id: paragraphContext.id,
					depth: paragraphContext.depth + 1
				};
			}

			$(node)
				.contents()
				.each((i, child) => {
					traverse(
						child,
						[...path, `${tagName}[${i}]`],
						nextInsideHeader,
						nextSkipAI,
						nextSkipAIHard,
						nextParagraphContext
					);
				});
		}
	}

	const body = $("body");
	const root = body.length > 0 ? body : $.root().children();

	root.contents().each((i, node) => traverse(node, [], false));

	return normalizeBlocks(blocks);
}

/**
 * Debug helper: Reconstruct the full text from blocks (as it would be seen for offsets).
 * This is useful for validating alignment with frontend text extraction.
 *
 * @param blocks - Text blocks from parseHtmlToBlocks
 * @returns The concatenated and normalized text that sentences reference via offsets
 */
export function reconstructTextFromBlocks(blocks: TextBlock[]): string {
	if (!blocks || blocks.length === 0) return "";

	// Simulate the same normalization that happens in segmentSentencesWithStructure
	let text = "";
	let pendingSpace = false;
	let hasOutput = false;

	for (const block of blocks) {
		for (const char of block.text) {
			if (/[\s\u00a0]/.test(char)) {
				if (hasOutput) {
					pendingSpace = true;
				}
			} else {
				if (pendingSpace) {
					text += " ";
					pendingSpace = false;
				}
				text += char;
				hasOutput = true;
			}
		}
	}

	return text;
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
	let bufferBlockRanges: { start: number; end: number; skipAI?: boolean; skipAIHard?: boolean }[] = [];

	for (let i = 0; i < blocks.length; i++) {
		const currentBlock = blocks[i];
		const nextBlock = blocks[i + 1];

		const bufferOffset = currentBuffer.length;
		currentBuffer += currentBlock.text;
		bufferBlockRanges.push({
			start: bufferOffset,
			end: bufferOffset + currentBlock.text.length,
			skipAI: currentBlock.skipAI,
			skipAIHard: currentBlock.skipAIHard
		});

		let hasSentenceBreakInside = /[.!?]/.test(currentBlock.text);

		let isStructuralBreak = false;
		if (nextBlock) {
			if (currentBlock.isHeader || nextBlock.isHeader) {
				isStructuralBreak = true;
			} else if (
				isStructuralBreakSignificant(currentBlock.path, nextBlock.path) &&
				!shouldSuppressStructuralBreakForParagraphChildren(currentBlock, nextBlock)
			) {
				isStructuralBreak = true;
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
				// For hard skip (non-paragraph links), if ANY part of the sentence is in the skip region,
				// we drop the whole sentence. This handles cases like "Read also: <link>" where
				// the sentence spans across the label and the link.
				const skipAIHard = overlapping.length > 0 && overlapping.some(r => r.skipAIHard === true);

				if (!skipAIHard) {
					sentences.push({
						id: sentences.length,
						text: s.text,
						start: absStart,
						end: absEnd,
						skipAI
					});
				}
			}
		};

		if (hasSentenceBreakInside) {
			const subSentences = standardSegment(currentBuffer, language);

			// Check if the last sentence is incomplete (no terminal punctuation)
			// and if we should continue accumulating (no structural break).
			const lastS = subSentences[subSentences.length - 1];
			const lastHasPunctuation = lastS && /[.!?]$/.test(lastS.text);

			if (lastS && !lastHasPunctuation && nextBlock && !isStructuralBreak) {
				// Keep the last segment in buffer
				subSentences.pop();
				pushSubSentences(subSentences);

				const cutPoint = lastS.start;
				sentenceStartIndex += cutPoint;
				currentBuffer = currentBuffer.slice(cutPoint);

				bufferBlockRanges = bufferBlockRanges
					.map(r => ({
						start: r.start - cutPoint,
						end: r.end - cutPoint,
						skipAI: r.skipAI,
						skipAIHard: r.skipAIHard
					}))
					.filter(r => r.end > 0);
			} else {
				pushSubSentences(subSentences);
				sentenceStartIndex += currentBuffer.length;
				currentBuffer = "";
				bufferBlockRanges = [];
			}
		} else if (isStructuralBreak) {
			// commit the whole buffer as a sentence
			const temp = currentBuffer;
			const startLocal = 0;
			const endLocal = temp.length;
			const overlapping = bufferBlockRanges.filter(r => !(r.end <= startLocal || r.start >= endLocal));
			const skipAI = overlapping.length > 0 && overlapping.every(r => r.skipAI === true);
			const skipAIHard = overlapping.length > 0 && overlapping.some(r => r.skipAIHard === true);

			if (!skipAIHard) {
				commitSentence(currentBuffer);
				// The commitSentence call already pushes the trimmed sentence without skipAI flag,
				// so we need to patch the last pushed sentence to carry skipAI information.
				if (sentences.length > 0) {
					sentences[sentences.length - 1].skipAI = skipAI;
				}
			} else {
				// If we skip hard, we still need to advance the start index
				sentenceStartIndex += currentBuffer.length;
				currentBuffer = "";
			}
			bufferBlockRanges = [];
		}
	}

	if (currentBuffer.trim()) {
		const subSentences = standardSegment(currentBuffer, language);
		subSentences.forEach(s => {
			const absStart = sentenceStartIndex + s.start;
			const absEnd = sentenceStartIndex + s.end;
			const overlapping = bufferBlockRanges.filter(r => !(r.end <= s.start || r.start >= s.end));
			const skipAIHard = overlapping.length > 0 && overlapping.some(r => r.skipAIHard === true);

			if (!skipAIHard) {
				sentences.push({
					id: sentences.length,
					text: s.text,
					start: absStart,
					end: absEnd
				});
			}
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
		// Parent is a block tag. We should break ONLY if one of the children is a block tag.
		// If both children are inline (text nodes or inline tags), we should not break.

		// Check next segment for A
		if (divergeIndex + 1 < pathA.length) {
			const nextTagA = getTagName(pathA[divergeIndex + 1]);
			if (BLOCK_TAGS.has(nextTagA)) return true;
		}

		// Check next segment for B
		if (divergeIndex + 1 < pathB.length) {
			const nextTagB = getTagName(pathB[divergeIndex + 1]);
			if (BLOCK_TAGS.has(nextTagB)) return true;
		}

		// If neither child is a block tag, treat as inline flow
		return false;
	}

	return false;
}

function shouldSuppressStructuralBreakForParagraphChildren(
	blockA: TextBlock,
	blockB: TextBlock,
	maxDepthFromParagraph = 2
): boolean {
	const ctxA = blockA.paragraphContext;
	const ctxB = blockB.paragraphContext;
	if (!ctxA || !ctxB) return false;
	if (ctxA.id !== ctxB.id) return false;
	if (ctxA.depth > maxDepthFromParagraph || ctxB.depth > maxDepthFromParagraph) return false;
	return true;
}

// --- segmenter z ochroną kropek ---

function standardSegment(text: string, language: string) {
	const protectedText = protectDots(text);

	const res: { text: string; start: number; end: number }[] = [];

	if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter === "function") {
		const segmenter = new (Intl as any).Segmenter(language, { granularity: "sentence" });
		for (const s of segmenter.segment(protectedText)) {
			const segmentStr = s.segment;
			const trimmedStr = segmentStr.trim();

			if (trimmedStr.length > 0) {
				const startOffset = segmentStr.search(/\S/);
				const t = restoreProtectedDots(trimmedStr);

				res.push({
					text: t,
					start: s.index + startOffset,
					end: s.index + startOffset + trimmedStr.length
				});
			}
		}
	} else {
		const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
		let m;
		while ((m = re.exec(protectedText)) !== null) {
			const segmentStr = m[0];
			const trimmedStr = segmentStr.trim();

			if (trimmedStr.length > 0) {
				const startOffset = segmentStr.search(/\S/);
				const t = restoreProtectedDots(trimmedStr);

				res.push({
					text: t,
					start: m.index + startOffset,
					end: m.index + startOffset + trimmedStr.length
				});
			}
		}
	}
	return res;
}
