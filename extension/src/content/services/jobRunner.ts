/// <reference types="chrome" />

import type { HighlightContext } from "../articleScraper";
import { buildDocumentContext } from "../articleScraper";
import { highlightText } from "../highlighting/factHighlight";

const serverAddress = process.env.SERVER ?? "";

export interface JobMeta {
	title?: string | null;
	url?: string | null;
}

export interface RunJobOptions {
	text?: string;
	meta?: JobMeta;
	context?: HighlightContext;
}

function getAuthHeaders(): Record<string, string> | undefined {
	if (serverAddress.startsWith("https://")) {
		return { Authorization: "Basic " + btoa(`${process.env.SERVER_USER}:${process.env.SERVER_PASS}`) };
	}
	return undefined;
}

export async function runJob(options: RunJobOptions = {}): Promise<void> {
	const resolvedContext = options.context ?? buildDocumentContext();
	const pageContent = typeof options.text === "string" ? options.text : resolvedContext.html;
	const title = options.meta?.title ?? resolvedContext.title ?? null;
	const url = options.meta?.url ?? (typeof location !== "undefined" ? location.href : null);
	const language = navigator?.language?.split("-")[0] ?? "en";

	const start = await fetch(`${serverAddress}/start`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			...getAuthHeaders()
		},
		body: JSON.stringify({ content: pageContent, title, url, language })
	});

	if (!start.ok) {
		const errorText = await start.text();
		console.error("Server start failed:", errorText);
		chrome.runtime.sendMessage({ type: "jobFailed", error: `Server failed to start job: ${start.status}` });
		return;
	}

	const { job_id }: { job_id: string } = await start.json();

	let done = false;
	let jobError = null;
	while (!done) {
		const statusRes = await fetch(`${serverAddress}/status?id=${job_id}`, {
			headers: { ...getAuthHeaders() }
		});
		if (!statusRes.ok) {
			jobError = `Status check failed with status ${statusRes.status}.`;
			done = true;
			break;
		}

		const status = await statusRes.json();
		if (status.status === "done") {
			highlightText(status.result, resolvedContext);
			console.log("Wynik:", status.result);
			chrome.runtime.sendMessage({ type: "jobCompleted" });
			done = true;
		} else if (status.status === "failed" || status.status === "error") {
			jobError = status.message || "Job failed on the server.";
			done = true;
		} else {
			console.log("Czekam...");
			await sleep(1000);
		}
	}

	if (jobError) {
		chrome.runtime.sendMessage({ type: "jobFailed", error: jobError });
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export { serverAddress };

export default {
	runJob,
	serverAddress
};
