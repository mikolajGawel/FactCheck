import { randomUUID } from "node:crypto";
// removed explicit express types on handler parameters to allow type inference
import { analyzeArticleSentences } from "../services/analyzer.js";
import { StartRequestSchema } from "../schemas/jobSchemas.js";
import { ensureJobBucket, getJob, buildJobRecord, getJobBucket } from "../services/jobsService.js";
import { buildCacheKey, readCache, writeCache } from "../services/cacheService.js";

const configuredSentenceLimit = Number(process.env.ANALYZER_MAX_SENTENCES);
const MAX_SENTENCES = Number.isNaN(configuredSentenceLimit) ? 300 : Math.max(1, configuredSentenceLimit);
export function getSenteceLimit(req,res) {
	return res.json({ max_sentences: MAX_SENTENCES });
}
export async function recvRequest(req, res) {
	const parsedBody = StartRequestSchema.safeParse(req.body ?? {});
	if (!parsedBody.success) {
		return res.status(400).json({
			error: "Nieprawidłowe dane wejściowe",
			details: parsedBody.error.flatten()
		});
	}

	const payload = parsedBody.data;
	const ip = resolveIp(req);
	const jobsForIp = ensureJobBucket(ip);
	const jobId = randomUUID();
	const cacheKey = buildCacheKey(payload);
	const cacheHit = cacheKey ? readCache(cacheKey) : null;

	if (cacheHit) {
		jobsForIp[jobId] = buildJobRecord({
			status: "done",
			result: cacheHit,
			cached: true
		});
		return res.json({ job_id: jobId, cached: true });
	}

	jobsForIp[jobId] = buildJobRecord({ status: "pending" });
	res.json({ job_id: jobId });

	processContent({ payload, ip, jobId, cacheKey }).catch(error => {
		console.error(`[JOB ${jobId}] krytyczny błąd`, error);
	});
}
export async function getResult(req, res) {
	const ip = resolveIp(req);
	const id = req.query.id as string;
	if (!id) {
		return res.status(400).json({ error: "Brak parametru 'id'" });
	}

	const jobBucket = getJobBucket(ip);
	if (!jobBucket) {
		return res.status(404).json({ error: "Brak zadań dla tego IP" });
	}

	const job = jobBucket[id];
	if (!job) {
		return res.status(403).json({ error: "Nie masz dostępu do tego zadania" });
	}

	return res.json({
		status: job.status,
		result: job.result,
		error: job.error,
		cached: job.cached ?? false,
		requestedAt: job.requestedAt,
		completedAt: job.completedAt ?? null,
		message: "Status zadania z serwera"
	});
}

async function processContent({ payload, ip, jobId, cacheKey }) {
	try {
		const result = await analyzeArticleSentences(payload, { jobId, cacheKey });
		const enrichedResult = cacheKey
			? {
					...result,
					metadata: { ...(result.metadata ?? {}), cacheKey }
			  }
			: result;
		const job = getJob(ip, jobId);

		if (job) {
			job.status = "done";
			job.result = enrichedResult;
			job.completedAt = Date.now();
		}

		if (cacheKey) {
			writeCache(cacheKey, enrichedResult);
		}
		console.log(`[JOB ${jobId}] zakończone dla IP ${ip}`);
	} catch (error: any) {
		const job = getJob(ip, jobId);
		if (job) {
			job.status = "error";
			job.error = error.message ?? String(error);
			job.completedAt = Date.now();
		}
		console.error(`[JOB ${jobId}] błąd (${ip}):`, error);
	}
}

function resolveIp(req) {
	return (
		(req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
		req.socket?.remoteAddress ||
		"unknown"
	);
}
