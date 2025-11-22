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

export async function logAICall(generationId: string, metadata?: { url?: string; article_title?: string }) {
	try {
		ensureLogDir();
		console.log("Logging AI call with generation ID:", generationId);

		const response = await fetch(`https://openrouter.ai/api/v1/generation?id=${generationId}`, {
			headers: {
				Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch generation details: ${response.status} ${response.statusText}`);
		}

		const payload = await response.json();
		// Merge metadata into the payload data if it exists
		if (metadata) {
			payload.data = { ...payload.data, ...metadata };
		}
		
		const line = JSON.stringify(payload);
		await fs.promises.appendFile(logFile, line + "\n", { encoding: "utf8" });
	} catch (err) {
		console.error("Failed to write ai log:", err);
	}
}

export default {
	logAICall
};
