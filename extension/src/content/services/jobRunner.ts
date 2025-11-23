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

	return {};
}

async function fetchServerLimit(): Promise<number> {
	return new Promise((resolve, reject) => {
		chrome.runtime.sendMessage({ type: "getServerLimit" }, resp => {
			if (resp?.max_sentences == null) {
				return reject(new Error("Failed to get server limit"));
			}

			resolve(resp?.max_sentences);
		});
	});
}

async function limitPayload(textForCounting: string): Promise<string> {
	// Helper: protect dots in common abbreviations and numeric decimals so we don't
	// split sentences inside abbreviations (simple heuristic similar to popup util).
	function protectDots(text: string): string {
		if (!text) return "";
		let result = text;
		const PROTECTED = [
			"dr",
			"inż",
			"mgr",
			"prof",
			"hab",
			"dot",
			"s",
			"ul",
			"al",
			"ks",
			"pl",
			"ppłk",
			"płk",
			"gen",
			"mjr",
			"por",
			"ppor",
			"kpt",
			"st",
			"plk",
			"św",
			"r",
			"tyś",
			"tys",
			"mln",
			"mld",
			"oprac",
			"prok"
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

	try {
		const limit = await fetchServerLimit();
		// TODO: actually limit/truncate text
		return textForCounting;
	} catch (e) {
		console.warn("Failed to fetch server limit. Content not truncated.");
		return textForCounting;
	}
}

export async function runJob(options: RunJobOptions = {}): Promise<void> {
	const resolvedContext = options.context ?? buildDocumentContext();
	// Prefer explicit text provided in options; otherwise use the resolved context.
	let pageContent = typeof options.text === "string" ? options.text : resolvedContext.html;
	pageContent = await limitPayload(pageContent);

	const title = options.meta?.title ?? resolvedContext.title ?? null;
	const url = options.meta?.url ?? (typeof location !== "undefined" ? location.href : null);
	const language = navigator?.language?.split("-")[0] ?? "en";

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
			const errorText = await start.text().catch(() => "(no body)");
			const message = `Server failed to start job: ${start.status} ${errorText}`;
			console.error("Server start failed:", message);
			chrome.runtime.sendMessage({ type: "jobFailed", error: message });
			return;
		}

		const body = await start.json();
		job_id = body.job_id;
	} catch (err: unknown) {
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
