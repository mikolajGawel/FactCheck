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
