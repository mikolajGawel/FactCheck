import { createHash } from "node:crypto";

const cacheStore = new Map();
const CACHE_TTL_MS = Number(process.env.ANALYZER_CACHE_TTL_MS ?? 10 * 60 * 1000);

export function buildCacheKey(payload) {
	if (payload.url) {
		return `url:${payload.url}`;
	}
	if (!payload.content) {
		return null;
	}
	return `content:${createHash("sha256").update(payload.content).digest("hex")}`;
}

export function readCache(key) {
	const cached = cacheStore.get(key);
	if (!cached) {
		return null;
	}
	if (cached.expiresAt < Date.now()) {
		cacheStore.delete(key);
		return null;
	}
	return cached.result;
}

export function writeCache(key, result) {
	cacheStore.set(key, {
		result,
		expiresAt: Date.now() + CACHE_TTL_MS
	});
}
