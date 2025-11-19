import { isWhitespace } from "./textUtils";

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
			if (ignoreSelector && parent.closest(ignoreSelector)) {
				return NodeFilter.FILTER_REJECT;
			}
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
