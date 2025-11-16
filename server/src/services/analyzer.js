import OpenAI from "openai";
import { AnalyzerResultSchema, SentenceLLMResponseSchema } from "../schemas/jobSchemas.js";
import { logAICall } from "./logger.js";
import { limitSentences, normalizeArticleText, segmentSentences } from "../utils/textUtils.js";
import { extractJsonObject, stringifyForPrompt } from "../utils/jsonUtils.js";
import { toJSONSchema } from "zod";
import utils from "util";

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL;

const configuredSentenceLimit = Number(process.env.ANALYZER_MAX_SENTENCES);
const MAX_SENTENCES = Number.isNaN(configuredSentenceLimit) ? 120 : Math.max(1, configuredSentenceLimit);

const configuredTemperature = Number(process.env.ANALYZER_TEMPERATURE);
const TEMPERATURE = Number.isNaN(configuredTemperature) ? 0.1 : configuredTemperature;

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
	const payload = sentences.map(({ id, text }) => ({ id, text }));

	const instructions = [
		{
			role: "system",
			content:
				"#Task\nClassify each sentence as 'fact', 'opinion', or 'uncertain'. You shouldn't check if reported news is true or false - only classify based on the sentence structure. Say how certain you are (0 to 1) about each sentence. Provide a brief rationale for your classification.\n\n##Output format\nReturn the results in JSON format (this should be the ONLY output). The outmost json object should have two properties: 'summary' (a brief summary (max 6 sentences) of the article that characterises its quality - is it reliable, biased, misleading, etc.) and 'sentences' (an array of json objects containing classified sentences). Each sentence object should have the following properties: 'sentenceId' (the id of the sentence), 'type' (the classification), 'confidence' (a number between 0 and 1), and 'rationale' (a brief explanation of your classification). Ensure the JSON is properly formatted."
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

	const startTs = Date.now();
	const completion = await client.chat.completions.create({
		model: DEFAULT_MODEL,
		temperature: TEMPERATURE,
		response_format: toJSONSchema(SentenceLLMResponseSchema),
		stream: false,
		messages: instructions
	});

	const endTs = Date.now();
	const meta = { id: completion.id, model: DEFAULT_MODEL, elapsedMs: endTs - startTs, usage: completion.usage ?? null };
	logAICall(meta);

	const rawContent = completion.choices?.[0]?.message?.content;
	// 	const rawContent = `{
	//   "summary": "Artykuł miesza raportowanie faktów (liczby i źródła) z opiniami, pytaniami retorycznymi i elementami editorialnymi. Podaje konkretne liczby i wskazuje źródła („brazylijskie media”, portal Tecnologia & Defesa), ale jednocześnie zawiera subiektywne oceny i sugestie dotyczące sensu zakupu oraz pytania-clickbaity. W kilku miejscach tekst jest niespójny lub ma błędy redakcyjne, co obniża jego przejrzystość. Ze względu na połączenie faktów i opinii warto traktować go jako materiał informacyjno-publicystyczny i sprawdzać kluczowe dane u pierwotnych źródeł.",
	//   "sentences": [
	//     {
	//       "sentenceId": 0,
	//       "type": "uncertain",
	//       "confidence": 0.9,
	//       "rationale": "Jest to pytanie retoryczne („Ukraińcy nie chcą starych Leopardów?”), a nie stwierdzenie faktu ani jednoznaczna opinia."
	//     },
	//     {
	//       "sentenceId": 1,
	//       "type": "fact",
	//       "confidence": 0.8,
	//       "rationale": "Deklaratywne zdanie raportujące informacje (źródła medialne, oferta z Niemiec, konkretne liczby) — struktura informacyjna, nie subiektywna ocena."
	//     },
	//     {
	//       "sentenceId": 2,
	//       "type": "fact",
	//       "confidence": 0.8,
	//       "rationale": "Zdanie opisuje okoliczności oferty i reakcje (wywołały komentarze) — to relacja faktograficzna, choć dość ogólna."
	//     },
	//     {
	//       "sentenceId": 3,
	//       "type": "fact",
	//       "confidence": 0.85,
	//       "rationale": "Opisuje, że część dziennikarzy i ekspertów kwestionuje sens zakupu i jakie mają argumenty — raportowanie cudzych opinii (fakt o istnieniu tych opinii)."
	//     },
	//     {
	//       "sentenceId": 4,
	//       "type": "fact",
	//       "confidence": 0.9,
	//       "rationale": "Stwierdzenie opisuje, że w Niemczech pojawiają się pytania dotyczące zgodności sprzedaży z zapowiedziami odbudowy Bundeswehry — relacja o reakcji/opiniach."
	//     },
	//     {
	//       "sentenceId": 5,
	//       "type": "fact",
	//       "confidence": 0.8,
	//       "rationale": "Deklaratywne stwierdzenie opisujące założenia programu zbrojeń uruchomionego przez Berlin — przedstawione jako fakt dotyczący programu."
	//     },
	//     {
	//       "sentenceId": 6,
	//       "type": "uncertain",
	//       "confidence": 0.95,
	//       "rationale": "Jest to pytanie („Ile plastiku mamy w ciele?”) — struktura pytająca, nie stwierdza fact/opinion."
	//     },
	//     {
	//       "sentenceId": 7,
	//       "type": "opinion",
	//       "confidence": 0.6,
	//       "rationale": "Zawiera ocenę/sugestię („Brazylia potrzebuje nowego czołgu, ale niekoniecznie Leoparda”) oraz fragment informacyjny; dominująca część ma charakter interpretacyjny/opiniotwórczy."
	//     },
	//     {
	//       "sentenceId": 8,
	//       "type": "fact",
	//       "confidence": 0.85,
	//       "rationale": "Deklaratywne stwierdzenie o wieku i pozycji tych czołgów wśród przekazanych — struktura informacyjna odnosząca się do cech czasowych."
	//     },
	//     {
	//       "sentenceId": 9,
	//       "type": "fact",
	//       "confidence": 0.9,
	//       "rationale": "Krótka, bezpośrednia informacja o okresie produkcji — zdanie faktograficzne."
	//     },
	//     {
	//       "sentenceId": 10,
	//       "type": "fact",
	//       "confidence": 0.9,
	//       "rationale": "Opis parametrów technicznych (masa, prędkość) — typowe stwierdzenie faktograficzne."
	//     },
	//     {
	//       "sentenceId": 11,
	//       "type": "opinion",
	//       "confidence": 0.8,
	//       "rationale": "Ocena znaczenia informacji („To istotna informacja...”) — wyrażenie wartościujące, a więc opinia."
	//     },
	//     {
	//       "sentenceId": 12,
	//       "type": "fact",
	//       "confidence": 0.85,
	//       "rationale": "Stwierdza historyczne i operacyjne informacje o poszukiwaniu następców Leopard 1 i okresie służby — struktura faktograficzna."
	//     },
	//     {
	//       "sentenceId": 13,
	//       "type": "opinion",
	//       "confidence": 0.75,
	//       "rationale": "Wyraża ocenę/przewidywanie co do priorytetów (wydawało się, że priorytetem jest...) — zdanie o charakterze interpretacyjnym/oceniającym."
	//     },
	//     {
	//       "sentenceId": 14,
	//       "type": "uncertain",
	//       "confidence": 0.95,
	//       "rationale": "Kolejne pytanie retoryczne („Ile Krabów zniszczyli Rosjanie?”) — struktura pytająca, nie twierdzi bezpośrednio faktu ani opinii."
	//     },
	//     {
	//       "sentenceId": 15,
	//       "type": "uncertain",
	//       "confidence": 0.6,
	//       "rationale": "Fragment jest niejednoznaczny i częściowo stanowi metadane/byline; składnia jest niejasna, więc trudno zaklasyfikować jako czysty fakt lub opinię."
	//     }
	//   ]
	// }`;

	const parsed = extractJsonObject(rawContent);
	const parsedValidated = SentenceLLMResponseSchema.parse(parsed);
	return { ...parsedValidated, _meta: null };
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
			rationale: classification.rationale
		});
	}

	return spans;
}
