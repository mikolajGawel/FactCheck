import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { logAICall } from "../src/services/logger.js";

const logFilePath = path.resolve(process.cwd(), "logs", "ai_requests.log");

test("logger writes a JSON line to file", async () => {
	// Remove the file if exists to isolate the test
	try {
		await fs.promises.unlink(logFilePath);
	} catch (e) {}

	await logAICall({ jobId: "test-1", model: "test-model", durationMs: 10 });
	const content = await fs.promises.readFile(logFilePath, "utf8");
	const lines = content.trim().split(/\r?\n/);
	const last = JSON.parse(lines[lines.length - 1]);
	assert.ok(last.jobId === "test-1");
	assert.equal(last.model, "test-model");
});
