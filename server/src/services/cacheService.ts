import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type CacheValue = { result: any; expiresAt: number };

const cacheStore = new Map<string, CacheValue>();

const CACHE_TTL_MS = Number(process.env.ANALYZER_CACHE_TTL_MS ?? 10 * 60 * 1000);
const CACHE_FILE = process.env.ANALYZER_CACHE_FILE ?? path.resolve(__dirname, "..", "..", "logs", "cache.json");

function saveCacheToFile() {
	try {
		fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
		const obj: Record<string, CacheValue> = {};
		for (const [k, v] of cacheStore.entries()) {
			obj[k] = v;
		}
		fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), "utf-8");
	} catch (err) {
		console.error(`Failed to save cache to file ${CACHE_FILE}:`, err);
	}
}

function loadCacheFromFile() {
	try {
		if (!fs.existsSync(CACHE_FILE)) {
			return;
		}
		const raw = fs.readFileSync(CACHE_FILE, "utf-8");
		const parsed = JSON.parse(raw || "{}") as Record<string, CacheValue>;
		for (const key of Object.keys(parsed)) {
			cacheStore.set(key, parsed[key]);
		}
	} catch (err) {
		console.error(`Failed to load cache from file ${CACHE_FILE}:`, err);
	}
}

loadCacheFromFile();

export function buildCacheKey(payload) {
	if (payload.url) return `url:${payload.url}`;
	if (!payload.content) return null;
	return `content:${createHash("sha256").update(payload.content).digest("hex")}`;
}

export function readCache(key) {
	const cached = cacheStore.get(key);
	if (!cached) return null;
	return cached.result; // TTL validation disabled for now — return cached result if present
}

export function writeCache(key, result) {
	cacheStore.set(key, {
		result,
		expiresAt: Date.now() + CACHE_TTL_MS
	});

	saveCacheToFile();
}
