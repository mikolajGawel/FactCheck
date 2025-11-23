import { isWhitespace } from "./textUtils";

/**
 * CRITICAL: Text extraction must match server/src/utils/textUtils.ts
 *
 * Backend skip behavior (parseHtmlToBlocks):
 * - Completely skips: script, style, nav, aside, footer, header, figure, iframe,
 *   noscript, template, button, time, form, meta, head, link, br
 * - Completely skips: elements with [hidden], [aria-hidden="true"], [data-factcheck-ignore]
 * - INCLUDES text from <a> outside <p>, but marks skipAI=true (for AI analysis only)
 *
 * Frontend must produce IDENTICAL text to ensure highlight offsets align correctly.
 */

interface TextSnapshot {
	text: string;
	pointers: import("../types/highlightTypes").TextPointer[];
}

interface TextPosition {
	node: Text;
	offset: number;
}

interface PendingWhitespace {
	start: TextPosition;
	end: TextPosition;
}

export function createTextSnapshot(root: HTMLElement, ignoreSelector: string): TextSnapshot {
	const doc = root.ownerDocument ?? document;
	const filter: NodeFilter = {
		acceptNode: node => {
			if (!(node instanceof Text)) {
				return NodeFilter.FILTER_SKIP;
			}
			const parent = node.parentElement;
			if (!parent) return NodeFilter.FILTER_SKIP;

			// Skip nodes in ignored elements (must match backend IGNORED_TAGS)
			// Backend skips: script, style, nav, aside, footer, header, figure, iframe,
			// noscript, template, button, time, form, meta, head, link + attribute filters
			if (ignoreSelector && parent.closest(ignoreSelector)) {
				return NodeFilter.FILTER_REJECT;
			}

			// NOTE: We do NOT skip <a> tags outside <p> here, matching backend behavior.
			// Backend includes that text but marks it skipAI=true for analysis filtering.
			// This ensures offsets align - both sides must have identical character counts.

			return NodeFilter.FILTER_ACCEPT;
		}
	};

	const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, filter);
	const textParts: string[] = [];
	const pointers: import("../types/highlightTypes").TextPointer[] = [];
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

/**
 * Debug helper: Validate that frontend text matches backend extracted text.
 * Call this after receiving backend response to detect offset misalignments early.
 *
 * @param frontendText - Text from createTextSnapshot()
 * @param backendText - Text from backend response (may not be available in all cases)
 * @returns true if texts match, false otherwise
 */
export function validateTextAlignment(frontendText: string, backendText: string): boolean {
	if (frontendText === backendText) {
		return true;
	}

	console.error("[FactCheck] Text alignment mismatch detected!", {
		frontendLength: frontendText.length,
		backendLength: backendText.length,
		lengthDiff: Math.abs(frontendText.length - backendText.length),
		frontendPreview: frontendText.substring(0, 200),
		backendPreview: backendText.substring(0, 200),
		frontendEnd: frontendText.substring(Math.max(0, frontendText.length - 100)),
		backendEnd: backendText.substring(Math.max(0, backendText.length - 100))
	});

	// Find first difference
	const minLen = Math.min(frontendText.length, backendText.length);
	for (let i = 0; i < minLen; i++) {
		if (frontendText[i] !== backendText[i]) {
			const contextStart = Math.max(0, i - 50);
			const contextEnd = Math.min(minLen, i + 50);
			console.error("[FactCheck] First difference at character", i, {
				frontend: frontendText.substring(contextStart, contextEnd),
				backend: backendText.substring(contextStart, contextEnd),
				frontendChar: JSON.stringify(frontendText[i]),
				backendChar: JSON.stringify(backendText[i])
			});
			break;
		}
	}

	return false;
}
