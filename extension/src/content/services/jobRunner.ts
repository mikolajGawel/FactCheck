/// <reference types="chrome" />

import type { HighlightContext } from "../articleScraper";
import { buildDocumentContext } from "../articleScraper";
import { highlightText } from "../highlighting/factHighlight";

const serverAddress = process.env.SERVER ?? "";

export interface JobMeta {
	title?: string | null;
	url?: string | null;
	articleId?: number;
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
	// Prefer explicit text provided in options; otherwise use the resolved context.
	// If the article text is very long (more than 300 sentences) truncate the
	// content sent to the server to the first 299 sentences to avoid huge payloads.
	let pageContent = typeof options.text === "string" ? options.text : resolvedContext.html;

	// Helper: protect dots in common abbreviations and numeric decimals so we don't
	// split sentences inside abbreviations (simple heuristic similar to popup util).
	function protectDots(text: string): string {
		if (!text) return "";
		let result = text;
		const PROTECTED = [
			"dr", "inż", "mgr", "prof", "hab", "dot", "s", "ul", "al", "ks",
			"pl", "ppłk", "płk", "gen", "mjr", "por", "ppor", "kpt", "st",
			"plk", "św", "r", "tyś", "tys", "mln", "mld", "oprac", "prok"
		];
		for (const abbr of PROTECTED) {
			const re = new RegExp("\\b" + abbr.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&") + "\\.(?=\\s|$)", "gi");
			result = result.replace(re, m => m.slice(0, -1) + "§");
		}
		// protect numeric decimals like 2.5
		result = result.replace(/(\d)\.(\d)/g, "$1§$2");
		return result;
	}

	function restoreProtectedDots(text: string): string {
		return (text || "").replace(/§/g, ".");
	}

	function splitIntoSentences(text: string): string[] {
		if (!text) return [];
		const protectedText = protectDots(text);
		// Use Intl.Segmenter if available for more accurate splits
		if (typeof Intl !== "undefined" && typeof (Intl as any).Segmenter === "function") {
			try {
				const seg = new (Intl as any).Segmenter(navigator.language || "en", { granularity: "sentence" });
				const out: string[] = [];
				for (const s of seg.segment(protectedText)) {
					const t = restoreProtectedDots(s.segment.trim());
					if (t) out.push(t);
				}
				return out;
			} catch (e) {
				// fall through to regex
			}
		}
		const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
		const res: string[] = [];
		let m: RegExpExecArray | null;
		while ((m = re.exec(protectedText)) !== null) {
			const t = restoreProtectedDots(m[0].trim());
			if (t) res.push(t);
		}
		return res;
	}

	// If we used resolvedContext.html as the pageContent, consider truncating based
	// on resolvedContext.text (the plain text snapshot) so we don't try to truncate
	// raw HTML. If user provided explicit `options.text`, treat it as authoritative
	// and perform truncation on it as plain text as well.
	const textForCounting = typeof options.text === "string" ? options.text : resolvedContext.text;
	const MAX_SENTENCES = 300;
	if (textForCounting) {
		const sentences = splitIntoSentences(textForCounting);
		if (sentences.length > MAX_SENTENCES) {
			// Keep first 299 sentences (as requested) and send that as the content.
			const keep = sentences.slice(0, MAX_SENTENCES - 1).join(" ");
			pageContent = keep;
			console.info(`Truncated content sent to server: original sentences=${sentences.length}, kept=${MAX_SENTENCES - 1}`);
		}
	}
	const title = options.meta?.title ?? resolvedContext.title ?? null;
	const url = options.meta?.url ?? (typeof location !== "undefined" ? location.href : null);
	const language = navigator?.language?.split("-")[0] ?? "en";

	// Try to start the job on the server. If fetch throws (network/CORS) or a non-OK
	// response is returned, treat it like any other job failure and notify the popup.
	let job_id: string | null = null;
	try {
		const start = await fetch(`${serverAddress}/start`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...getAuthHeaders()
			},
			body: JSON.stringify({ content: pageContent, title, url, language })
		});

		if (!start.ok) {
			// Keep message consistent for non-ok responses
			const errorText = await start.text().catch(() => "(no body)");
			const message = `Server failed to start job: ${start.status} ${errorText}`;
			console.error("Server start failed:", message);
			chrome.runtime.sendMessage({ type: "jobFailed", error: message });
			return;
		}

		const body = await start.json();
		job_id = body.job_id;
	} catch (err: unknown) {
		// Treat thrown errors (CORS, network errors, etc.) the same way as non-ok
		const message = err && typeof err === "object" && "message" in err ? (err as any).message : String(err);
		console.error("Server start failed:", message);
		chrome.runtime.sendMessage({ type: "jobFailed", error: `Server failed to start job: ${message}` });
		return;
	}

	let done = false;
	let jobError = null;
	while (!done) {
		try {
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
				chrome.runtime.sendMessage({
					type: "jobCompleted",
					articleId: options.meta?.articleId,
					url: options.meta?.url
				});
				done = true;
			} else if (status.status === "failed" || status.status === "error") {
				jobError = status.message || "Job failed on the server.";
				done = true;
			} else {
				console.log("Czekam...");
				await sleep(1000);
			}
		} catch (err: unknown) {
			// Any thrown error during status check (network/CORS/json parse) should
			// be reported the same way as other failures.
			jobError = err && typeof err === "object" && "message" in err ? (err as any).message : String(err);
			done = true;
			break;
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
