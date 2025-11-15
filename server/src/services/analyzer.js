import OpenAI from "openai";
import { AnalyzerResultSchema, SentenceLLMResponseSchema } from "../schemas/jobSchemas.js";
import { limitSentences, normalizeArticleText, segmentSentences } from "../utils/textUtils.js";
import { extractJsonObject, stringifyForPrompt } from "../utils/jsonUtils.js";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL;

const configuredSentenceLimit = Number(process.env.ANALYZER_MAX_SENTENCES);
const MAX_SENTENCES = Number.isNaN(configuredSentenceLimit) ? 120 : Math.max(1, configuredSentenceLimit);

const configuredTemperature = Number(process.env.ANALYZER_TEMPERATURE);
const TEMPERATURE = Number.isNaN(configuredTemperature) ? 0.1 : configuredTemperature;

const configuredMaxTokens = Number(process.env.ANALYZER_MAX_TOKENS);
const MAX_TOKENS = Number.isNaN(configuredMaxTokens) ? 1200 : configuredMaxTokens;

let cachedClient = null;

function getOpenRouterClient() {
	if (cachedClient) return cachedClient;

	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		throw new Error("Brak klucza OPENROUTER_API_KEY w zmiennych środowiskowych");
	}

	cachedClient = new OpenAI({
		apiKey,
		baseURL: process.env.OPENROUTER_BASE_URL,
		defaultHeaders: {
			"HTTP-Referer": process.env.OPENROUTER_SITE_URL,
			"X-Title": process.env.OPENROUTER_APP_NAME
		}
	});

	return cachedClient;
}

export async function analyzeArticleSentences(payload) {
	const { content, title = null } = payload;
	const language = payload.language?.trim() || "en";
	const normalizedText = normalizeArticleText(content);

	if (normalizedText.length < 200) {
		throw new Error("Zbyt krótka treść artykułu do analizy (min. 200 znaków)");
	}

	const allSentences = segmentSentences(normalizedText, language) ?? [];
	if (allSentences.length === 0) {
		throw new Error("Nie udało się wyodrębnić zdań z artykułu");
	}

	const limitedSentences = limitSentences(allSentences, MAX_SENTENCES);
	const llmResponse = await classifySentencesWithLLM(limitedSentences, { title, language });
	const spans = buildSpansFromClassification(limitedSentences, llmResponse.sentences);

	const analyzerResult = {
		document: {
			title,
			language,
			contentLength: normalizedText.length,
			sentenceCount: allSentences.length
		},
		summary: llmResponse.summary ?? null,
		spans,
		metadata: {
			truncated: allSentences.length > limitedSentences.length
		}
	};

	return AnalyzerResultSchema.parse(analyzerResult);
}

async function classifySentencesWithLLM(sentences, metadata) {
	const client = getOpenRouterClient();
	const payload = sentences.map(({ id, text }) => ({ id, text }));

	const instructions = [
		{
			role: "system",
			content:
				"Classify each sentence as 'fact', 'opinion', or 'uncertain'. Return only valid JSON with the structure {\"summary\": string?, \"sentences\": SentenceClassification[] }."
		},
		{
			role: "user",
			content: stringifyForPrompt({
				document: {
					title: metadata.title,
					language: metadata.language
				},
				sentences: payload
			})
		}
	];

	const completion = await client.chat.completions.create({
		model: DEFAULT_MODEL,
		temperature: TEMPERATURE,
		response_format: { type: "json_object" },
		messages: instructions,
		max_tokens: MAX_TOKENS
	});

	const rawContent = completion.choices?.[0]?.message?.content;
	const parsed = extractJsonObject(rawContent);

	return SentenceLLMResponseSchema.parse(parsed);
}

function buildSpansFromClassification(sentences, classifications) {
	const spans = [];
	const indexById = new Map(sentences.map(sentence => [sentence.id, sentence]));

	for (const classification of classifications) {
		const sentence = indexById.get(classification.sentenceId);
		if (!sentence) continue;

		spans.push({
			id: `sent-${sentence.id}`,
			type: classification.type,
			start: sentence.start,
			end: sentence.end,
			text: sentence.text,
			confidence: classification.confidence,
			metadata: classification.rationale ? { rationale: classification.rationale } : undefined
		});
	}

	return spans;
}
