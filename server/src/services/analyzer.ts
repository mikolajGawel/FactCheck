import OpenAI from "openai";
import { AnalyzerResultSchema, SentenceLLMResponseSchema } from "../schemas/jobSchemas.js";
import { logAICall } from "./logger.js";
import { limitSentences, segmentSentencesWithStructure, parseHtmlToBlocks } from "../utils/textUtils.js";
import { escapeDangerousContent } from "../utils/sanitize.js";
import { extractJsonObject, stringifyForPrompt } from "../utils/jsonUtils.js";
import utils from "util";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL;

const configuredSentenceLimit = Number(process.env.ANALYZER_MAX_SENTENCES);
const MAX_SENTENCES = Number.isNaN(configuredSentenceLimit) ? 200 : Math.max(1, configuredSentenceLimit);

const configuredTemperature = Number(process.env.ANALYZER_TEMPERATURE);
const TEMPERATURE = Number.isNaN(configuredTemperature) ? 0.1 : configuredTemperature;

let cachedClient: OpenAI | null = null;

// Track active LLM processing count (for scheduling restarts in development)
let aiProcessingCount = 0;
let restartRequested = false;

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

export async function analyzeArticleSentences(payload, _context?) {
	const { content, title = null } = payload;
	const language = payload.language?.trim() || "en";

	// ZMIANA: Najpierw parsujemy strukturę HTML
	// Zakładamy, że payload.content to HTML string.
	const textBlocks = parseHtmlToBlocks(content);

	// Obliczamy całkowitą długość tekstu (do walidacji)
	const totalTextLength = textBlocks.reduce((acc, block) => acc + block.text.length, 0);

	if (totalTextLength < 200) {
		throw new Error("Zbyt krótka treść artykułu do analizy (min. 200 znaków)");
	}

	// ZMIANA: Używamy nowej funkcji segmentującej biorącej pod uwagę strukturę
	const allSentences = segmentSentencesWithStructure(textBlocks, language) ?? [];

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
			contentLength: totalTextLength, // Używamy obliczonej długości z bloków
			sentenceCount: allSentences.length
		},
		summary: escapeDangerousContent(llmResponse.summary ?? null),
		spans,
		metadata: {
			truncated: allSentences.length > limitedSentences.length
		}
	};

	try {
		const validated = AnalyzerResultSchema.parse(analyzerResult);
		return validated;
	} catch (err) {
		console.error(
			"Failed to validate analyzer result:",
			utils.inspect(analyzerResult, { showHidden: false, depth: null, colors: true })
		);

		throw err;
	}
}

async function classifySentencesWithLLM(sentences, metadata) {
	const client = getOpenRouterClient();
	aiProcessingCount++;
	try {
		const payload = sentences.map(({ id, text }) => ({ id, text }));

		const instructions = [
			{
				role: "system",
				content:
					"#Task\nClassify each sentence as 'fact', 'opinion', or 'uncertain'. You shouldn't check if reported news is true or false - only classify based on the sentence structure. Say how certain you are (0 to 1) about each sentence. Provide a brief rationale for your classification. Write the rationale in the language of the sentence (in case of doubts, use the polish language).\n\n##Output format\nReturn the results in JSON format (this should be the ONLY output). The outmost json object should have two properties: 'summary' (a brief summary (max 6 sentences) of the article that characterises its quality - is it reliable, biased, misleading, etc.) and 'sentences' (an array of json objects containing classified sentences). Each sentence object should have the following properties: 'sentenceId' (the id of the sentence), 'type' (the classification), 'confidence' (a number between 0 and 1), and 'rationale' (a brief explanation of your classification). Ensure the JSON is properly formatted."
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
			model: DEFAULT_MODEL as string,
			temperature: TEMPERATURE,
			stream: false,
			// Explicitly cast messages to any to satisfy API typing
			messages: instructions as any
		});

		new Promise(resolve => setTimeout(resolve, 3000)).then(() => {
			console.log("Logging AI call with generation ID:", completion.id);
			logAICall(completion.id);
		});

		const rawContent = completion.choices?.[0]?.message?.content;
		if (!rawContent || typeof rawContent !== "string") {
			throw new Error("No textual content returned from LLM");
		}
		const parsed = extractJsonObject(rawContent);
		const parsedValidated = SentenceLLMResponseSchema.parse(parsed);
		return { ...parsedValidated, _meta: null };
	} finally {
		setTimeout(_onLLMCallComplete, 4000);
	}
}

function buildSpansFromClassification(sentences: any[], classifications: any[]) {
	const spans: any[] = [];
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
			rationale: escapeDangerousContent(classification.rationale)
		});
	}

	return spans;
}

// Expose a few helper functions so other parts of the server (like the dev
// restart endpoint) can query whether the analyzer is currently working and
// optionally request a restart once processing is finished.
export function isAIProcessing() {
	return aiProcessingCount > 0;
}

export function requestRestartAfterProcessing() {
	restartRequested = true;
	// If there are no active processes, enforce a restart immediately.
	if (aiProcessingCount === 0) {
		console.log("No active AI processing, exiting process for restart");
		setTimeout(() => process.exit(0), 0);
	}
}

// Internal helper - call whenever an LLM call completes (success/error)
function _onLLMCallComplete() {
	aiProcessingCount = Math.max(0, aiProcessingCount - 1);
	if (restartRequested && aiProcessingCount === 0) {
		console.log("AI processing finished and restart was requested. Exiting");
		setTimeout(() => process.exit(0), 0);
	}
}
