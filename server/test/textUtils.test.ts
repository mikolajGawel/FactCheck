import test from "node:test";
import assert from "node:assert/strict";

import {
	limitSentences,
	normalizeArticleText,
	segmentSentencesWithStructure,
	parseHtmlToBlocks
} from "../src/utils/textUtils.js";

test("normalizeArticleText collapses whitespace", () => {
	const raw = "Headline\n\nThis\tis\ttext.\r\nNext line.";
	const normalized = normalizeArticleText(raw);
	assert.equal(normalized, "Headline This is text. Next line.");
});

test("segmentSentencesWithStructure returns stable offsets from HTML", () => {
	const html = "<p>First fact.</p> <p>Second opinion!</p> <div>Third sentence?</div>";
	const blocks = parseHtmlToBlocks(html);
	const sentences = segmentSentencesWithStructure(blocks, "en");

	assert.equal(sentences.length, 3);
	assert.deepEqual(
		sentences.map(sentence => sentence.text),
		["First fact.", "Second opinion!", "Third sentence?"]
	);
});

test("parseHtmlToBlocks ignores specified tags", () => {
	const html = "<p>Fact.</p><nav>Menu</nav><footer>Footer</footer><button>Click</button>";
	const blocks = parseHtmlToBlocks(html);
	// Should only contain "Fact."
	const text = blocks.map(b => b.text).join("");
	assert.equal(text, "Fact.");
});

test("parseHtmlToBlocks handles leading whitespace", () => {
	const html = "   <p>Fact.</p>";
	const blocks = parseHtmlToBlocks(html);
	// Should be trimmed
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].text, "Fact.");
});

test("parseHtmlToBlocks merges whitespace across blocks", () => {
	const html = "<div>A</div> <div>B</div>";
	const blocks = parseHtmlToBlocks(html);
	// Should be "A", " B" or "A", "B" -> joined "A B"
	const text = blocks.map(b => b.text).join("");
	assert.equal(text, "A B");
});

test("limitSentences truncates arrays", () => {
	const sentences = Array.from({ length: 5 }, (_, index) => ({ id: index }));
	const limited = limitSentences(sentences, 2);
	assert.equal(limited.length, 2);
});
