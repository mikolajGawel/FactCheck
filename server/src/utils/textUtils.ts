import { normalizeText } from "../../../shared/dist/textProcessing.js";

export function normalizeArticleText(raw) {
	return normalizeText(raw);
}

export function segmentSentences(text: string, language = "en") {
	if (!text) return [];

	const sentences: { id: number; text: string; start: number; end: number }[] = [];
	if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter === "function") {
		const segmenter = new (Intl as any).Segmenter(language, { granularity: "sentence" });
		for (const segment of segmenter.segment(text)) {
			pushSentence(sentences, text, segment.index, segment.segment.length);
		}
	} else {
		const fallbackRegex = /[^.!?]+[.!?]+|[^.!?]+$/g;
		let match: RegExpExecArray | null;
		while ((match = fallbackRegex.exec(text)) !== null) {
			pushSentence(sentences, text, match.index, match[0].length);
		}
	}

	return sentences;
}

export function limitSentences<T>(sentences: T[], maxCount?: number) {
	if (!maxCount || sentences.length <= maxCount) {
		return sentences;
	}

	return sentences.slice(0, maxCount);
}

function pushSentence(bucket, source: string, startIndex: number, rawLength: number) {
	if (typeof startIndex !== "number" || typeof rawLength !== "number") {
		return;
	}

	let start = startIndex;
	let end = startIndex + rawLength;

	while (start < end && /\s/.test(source[start])) {
		start += 1;
	}

	while (end > start && /\s/.test(source[end - 1])) {
		end -= 1;
	}

	if (end <= start) {
		return;
	}

	const text = source.slice(start, end).trim();
	if (!text) {
		return;
	}

	bucket.push({
		id: bucket.length,
		text,
		start,
		end
	});
}
