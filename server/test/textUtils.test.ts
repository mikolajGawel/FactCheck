import test from "node:test";
import assert from "node:assert/strict";

import { limitSentences, normalizeArticleText, segmentSentences } from "../src/utils/textUtils.js";

test("normalizeArticleText collapses whitespace", () => {
	const raw = "Headline\n\nThis\tis\ttext.\r\nNext line.";
	const normalized = normalizeArticleText(raw);
	assert.equal(normalized, "Headline This is text. Next line.");
});

test("segmentSentences returns stable offsets", () => {
	const text = "First fact. Second opinion! Third sentence?";
	const sentences = segmentSentences(text, "en");

	assert.equal(sentences.length, 3);
	assert.deepEqual(
		sentences.map(sentence => sentence.text),
		["First fact.", "Second opinion!", "Third sentence?"]
	);
	assert.equal(sentences[0].start, 0);
	assert.equal(sentences[0].end, 11);
});

test("limitSentences truncates arrays", () => {
	const sentences = Array.from({ length: 5 }, (_, index) => ({ id: index }));
	const limited = limitSentences(sentences, 2);
	assert.equal(limited.length, 2);
});
