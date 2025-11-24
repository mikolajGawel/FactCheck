import { z } from "zod";

export const StartRequestSchema = z.object({
	content: z
		.string()
		.min(200, "Treść artykułu musi mieć co najmniej 200 znaków")
		.max(100000, "Treść artykułu jest zbyt długa (limit 100k znaków)"),
	title: z.string().max(512).trim().optional(),
	url: z.string().url("Nieprawidłowy adres URL").optional(),
	language: z.string().min(2).max(12).trim().optional(),
	articleId: z.number().int().optional()
});

export const CacheCheckSchema = z.object({
	content: z.string().optional(),
	url: z.string().url().optional(),
	articleId: z.number().int().optional()
});

export const EvidenceSchema = z.object({
	type: z.enum(["url", "text"]).default("text"),
	value: z.string().min(1),
	snippet: z.string().optional(),
	confidence: z.number().min(0).max(1).optional()
});

export const SpanSchema = z
	.object({
		id: z.string().min(1),
		type: z.enum(["fact", "opinion", "uncertain"]),
		start: z.number().int().nonnegative(),
		end: z.number().int().nonnegative(),
		text: z.string().min(1),
		confidence: z.number().min(0).max(1),
		rationale: z.string().min(1)
	})
	.refine(value => value.end > value.start, {
		message: "Wartość 'end' musi być większa niż 'start'",
		path: ["end"]
	});

export const AnalyzerResultSchema = z.object({
	document: z.object({
		title: z.string().nullable().optional(),
		language: z.string().min(2).max(12).nullable().optional(),
		contentLength: z.number().int().nonnegative(),
		sentenceCount: z.number().int().nonnegative()
	}),
	summary: z.string().max(2000).nullable().optional(),
	spans: z.array(SpanSchema),
	metadata: z
		.object({
			truncated: z.boolean().optional(),
			cacheKey: z.string().optional()
		})
		.optional(),
	errors: z.array(z.string()).optional()
});

export const SentenceClassificationSchema = z.object({
	sentenceId: z.number().int().nonnegative(),
	type: z.enum(["fact", "opinion", "uncertain"]),
	confidence: z.number().min(0).max(1),
	rationale: z.string()
});

export const SentenceLLMResponseSchema = z.object({
	summary: z.string().max(2000).nullable().optional(),
	sentences: z.array(SentenceClassificationSchema)
});
