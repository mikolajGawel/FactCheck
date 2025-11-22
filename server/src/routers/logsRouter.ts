import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const logsRouter = Router();

const logDir = path.resolve(process.cwd(), "logs");
const logFile = path.join(logDir, "ai_requests.log");

logsRouter.get("/", async (req, res) => {
	try {
		if (!fs.existsSync(logFile)) {
			return res.json([]);
		}

		const fileStream = fs.createReadStream(logFile);
		const rl = readline.createInterface({
			input: fileStream,
			crlfDelay: Infinity
		});

		const logs: any[] = [];

		for await (const line of rl) {
			if (line.trim()) {
				try {
					logs.push(JSON.parse(line));
				} catch (e) {
					console.error("Failed to parse log line:", line);
				}
			}
		}

		res.json(logs);
	} catch (error) {
		console.error("Error reading logs:", error);
		res.status(500).json({ error: "Failed to read logs" });
	}
});

export default logsRouter;
