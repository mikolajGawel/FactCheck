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

	// The concatenated normalized text should contain each sentence exactly
	const joined = blocks.map(b => b.text).join("");
	for (let i = 0; i < sentences.length; i++) {
		const s = sentences[i];
		// The substring denoted by start..end must equal the sentence text
		assert.equal(joined.slice(s.start, s.end), s.text);
		// Leading character of a sentence must not be a whitespace
		assert.notEqual(joined[s.start], " ");
		// Trailing whitespace (space between sentences) should be outside the sentence
		if (s.end < joined.length) {
			assert.equal(joined[s.end], " ");
		}
	}
});

test.describe("segmentSentencesWithStructure keeps shallow paragraph children together", () => {
	function testCase(html) {
		const blocks = parseHtmlToBlocks(html);
		const sentences = segmentSentencesWithStructure(blocks, "en");
		return sentences;
	}

	test("concatenates sibling children inside a paragraph into a single sentence", () => {
		const html = "<p><div>Alpha </div><div>beta without dot</div></p>";
		const processed = testCase(html);
		assert.equal(processed.length, 1);
		assert.equal(processed[0].text, "Alpha beta without dot");
	});

	test("preserves inline nesting without breaking the sentence flow", () => {
		const html = "<p>Alpha <span>beta</span> without dot</p>";
		const processed = testCase(html);
		assert.equal(processed.length, 1);
		assert.equal(processed[0].text, "Alpha beta without dot");
	});

	test("recognizes sentence-ending punctuation inside nested inline elements", () => {
		const html = "<p>Alpha <strong>beta with dot inside span.</strong></p>";
		const processed = testCase(html);
		assert.equal(processed.length, 1);
		assert.equal(processed[0].text, "Alpha beta with dot inside span.");
	});

	test("splits paragraph into multiple sentences when nested inline contains terminal punctuation", () => {
		const html = "<p>This is sentence One. Now sentence 2 <strong>is starting with dot inside span.</strong></p>";
		const processed = testCase(html);
		assert.equal(processed.length, 2);
		assert.equal(processed[0].text, "This is sentence One.");
		assert.equal(processed[1].text, "Now sentence 2 is starting with dot inside span.");
	});
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
