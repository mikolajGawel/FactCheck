export interface HighlightSpan {
	start: number;
	end: number;
	type?: string;
	rationale?: string;
	confidence?: number;
}

export interface HighlightResult {
	spans: HighlightSpan[];
}

// Additional shared types used by content modules
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
	html: string;
	pointers: TextPointer[];
	ignoreSelector: string;
	title?: string | null;
}
