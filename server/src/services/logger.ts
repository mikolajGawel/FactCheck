import fs from "node:fs";
import path from "node:path";

const logDir = path.resolve(process.cwd(), "logs");
const logFile = path.join(logDir, "ai_requests.log");

function ensureLogDir() {
	try {
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
	} catch (err) {
		// Not fatal — logging will fallback to console
		console.error("Failed to create logs directory:", err);
	}
}

export async function logAICall(entry) {
	try {
		ensureLogDir();
		const payload = {
			ts: new Date().toISOString(),
			...entry
		};
		const line = JSON.stringify(payload);
		await fs.promises.appendFile(logFile, line + "\n", { encoding: "utf8" });
	} catch (err) {
		console.error("Failed to write ai log:", err);
	}
}

export default {
	logAICall
};
