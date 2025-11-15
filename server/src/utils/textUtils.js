const NBSP_REGEX = /\u00a0/g;
const MULTISPACE_REGEX = /[ \t\f\v]+/g;
const MULTILINE_REGEX = /\s*\n+\s*/g;

export function normalizeArticleText(raw) {
	if (!raw) return "";
	return String(raw)
		.replace(/\r\n?/g, "\n")
		.replace(NBSP_REGEX, " ")
		.replace(MULTILINE_REGEX, " ")
		.replace(MULTISPACE_REGEX, " ")
		.replace(/ {2,}/g, " ")
		.trim();
}

export function segmentSentences(text, language = "en") {
	if (!text) return [];

	const sentences = [];
	if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
		const segmenter = new Intl.Segmenter(language, { granularity: "sentence" });
		for (const segment of segmenter.segment(text)) {
			pushSentence(sentences, text, segment.index, segment.segment.length);
		}
	} else {
		const fallbackRegex = /[^.!?]+[.!?]+|[^.!?]+$/g;
		let match;
		while ((match = fallbackRegex.exec(text)) !== null) {
			pushSentence(sentences, text, match.index, match[0].length);
		}
	}

	return sentences;
}

export function limitSentences(sentences, maxCount) {
	if (!maxCount || sentences.length <= maxCount) {
		return sentences;
	}

	return sentences.slice(0, maxCount);
}

function pushSentence(bucket, source, startIndex, rawLength) {
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
