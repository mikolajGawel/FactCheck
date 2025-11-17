import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

process.env.ANALYZER_CACHE_TTL_MS = String(1000 * 60 * 60); // large ttl to avoid expiry concerns
const cacheFilePath = path.resolve(process.cwd(), "logs", "cache.test.json");
process.env.ANALYZER_CACHE_FILE = cacheFilePath;

// Cleanup helper
async function cleanup() {
	try {
		await fs.promises.unlink(cacheFilePath);
	} catch (e) {}
}

await cleanup();
const cacheService = await import("../src/services/cacheService.js");

test("buildCacheKey returns null when missing payload and returns url: prefix for url", () => {
	assert.equal(cacheService.buildCacheKey({}), null);
	const urlKey = cacheService.buildCacheKey({ url: "http://example.com" });
	assert.ok(typeof urlKey === "string");
	assert.ok(urlKey.startsWith("url:"));
	assert.equal(urlKey, "url:http://example.com");
});

test("buildCacheKey returns content:sha256 for content payload", () => {
	const content = "This is some test content";
	const expectedHash = createHash("sha256").update(content).digest("hex");
	const key = cacheService.buildCacheKey({ content });
	assert.equal(key, `content:${expectedHash}`);
});

test("writeCache and readCache store and retrieve values, and persist to file", async () => {
	await cleanup(); // Start fresh

	const key = cacheService.buildCacheKey({ url: "http://persist.test" });
	if (key == null) throw new Error("Expected non-null key");
	assert.equal(cacheService.readCache(key), null);

	const value = { result: { label: "fact" }, meta: { t: 1 } };
	cacheService.writeCache(key, value);
	// readCache returns the stored result
	assert.deepEqual(cacheService.readCache(key), value);

	// The underlying file should exist and contain the key
	const raw = await fs.promises.readFile(cacheFilePath, "utf-8");
	const parsed = JSON.parse(raw);
	assert.ok(parsed[key]);
	assert.deepEqual(parsed[key].result, value);
});

test("readCache returns null for unknown keys", () => {
	assert.equal(cacheService.readCache("nonexistent:key"), null);
});

// Ensure the test log file is deleted after all tests finish
test.after(async () => {
	await cleanup();
});
