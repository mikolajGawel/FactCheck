/// <reference types="chrome" />

import {
	collectArticles,
	collectArticleText,
	buildArticleContext,
	buildCustomContext,
	buildDocumentContext,
	type HighlightContext
} from "./articleScraper";
import { runJob } from "./services/jobRunner";

type RuntimeMessage =
	| ({ type: "startJob" } & StartJobPayload)
	| { type: "getArticles" }
	| { type: "getArticleText"; articleId: number }
	| { type: "ping" };

type StartJobPayload = {
	articleId?: number;
	content?: string;
	title?: string | null;
	url?: string | null;
};

declare global {
	interface Window {
		__FactCheck_injected?: boolean;
	}
}

if (!window.__FactCheck_injected) {
	window.__FactCheck_injected = true;
	chrome.runtime.onMessage.addListener(onMessage);
}

function onMessage(
	message: RuntimeMessage,
	_sender: chrome.runtime.MessageSender,
	sendResponse: (response?: unknown) => void
) {
	if (!message || !("type" in message)) return false;

	switch (message.type) {
		case "startJob": {
			const { context, content, meta } = resolveStartJobContext(message);
			runJob({ text: content, meta, context }).catch((err: unknown) => console.error("runJob error:", err));
			sendResponse({ status: "job_started" });
			return true;
		}

		case "getArticles": {
			sendResponse({ articles: collectArticles() });
			return true;
		}

		case "getArticleText": {
			sendResponse({ articleText: collectArticleText(message.articleId) });
			return true;
		}

		case "ping": {
			sendResponse({ status: "pong" });
			return true;
		}

		default:
			return false;
	}
}

function resolveStartJobContext(payload: StartJobPayload): {
	context: HighlightContext;
	content: string;
	meta: { title: string | null; url: string | null; articleId?: number };
} {
	const meta = { title: payload.title ?? null, url: payload.url ?? null, articleId: payload.articleId };

	if (typeof payload.articleId === "number") {
		const context = buildArticleContext(payload.articleId);
		return {
			context,
			content: context.html,
			meta: { ...meta, title: meta.title ?? context.title ?? null }
		};
	}

	if (typeof payload.content === "string" && payload.content.trim().length) {
		const context = buildCustomContext(payload.content);
		return { context, content: payload.content, meta };
	}

	const context = buildDocumentContext();
	return {
		context,
		content: context.html,
		meta: { ...meta, title: meta.title ?? context.title ?? null }
	};
}
