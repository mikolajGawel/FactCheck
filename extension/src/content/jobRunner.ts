/// <reference types="chrome" />

import type { HighlightContext } from "./articleScraper";
import { buildDocumentContext } from "./articleScraper";
import { highlightText } from "./factHighlight";

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

export async function runJob(options: RunJobOptions = {}): Promise<void> {
	const resolvedContext = options.context ?? buildDocumentContext();
	const pageContent = typeof options.text === "string" ? options.text : resolvedContext.text;
	const title = options.meta?.title ?? resolvedContext.title ?? null;
	const url = options.meta?.url ?? (typeof location !== "undefined" ? location.href : null);
	const language = navigator?.language?.split("-")[0] ?? "en";

	chrome.runtime.sendMessage({ type: "startJob" });

	const startResponse = await fetch(`${serverAddress}/start`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ content: pageContent, title, url, language })
	});

	const { job_id }: { job_id: string } = await startResponse.json();

	let done = false;
	while (!done) {
		const statusRes = await fetch(`${serverAddress}/status?id=${job_id}`);
		const status = await statusRes.json();
		if (status.status === "done") {
			highlightText(status.result, resolvedContext);
			console.log("Wynik:", status.result);
			chrome.runtime.sendMessage({ type: "jobCompleted" });
			done = true;
		} else {
			console.log("Czekam...");
			await sleep(2000);
		}
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
