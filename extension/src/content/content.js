import { collectArticles, collectArticleText } from "./articleScraper.js";
import { runJob } from "./jobRunner.js";
/*
  This content script listens for a message `{ type: "startJob" }` from the
  background/service worker and only then starts executing `runJob()`.
*/

// Prevent double injection
if (!window.__FactCheck_injected) {
	window.__FactCheck_injected = true;

	// Listen for runtime messages
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (!message || !message.type) return false;

		if (message.type === "startJob") {
			// message can contain { articleId } or { content } and optional { title, url }
			const meta = { title: message.title ?? null, url: message.url ?? null };
			if (message.articleId !== undefined) {
				const text = collectArticleText(message.articleId);
				runJob(text, meta).catch(err => console.error("runJob error:", err));
			} else if (message.content) {
				runJob(message.content, meta).catch(err => console.error("runJob error:", err));
			} else {
				// fallback to whole page
				runJob(undefined, meta).catch(err => console.error("runJob error:", err));
			}

			sendResponse({ status: "job_started" });
			return true;
		}

		if (message.type === "getArticles") {
			const articles = collectArticles();
			sendResponse({ articles });
			return true;
		}

		if (message.type === "getArticleText") {
			const id = message.articleId;
			const text = collectArticleText(id);
			sendResponse({ articleText: text });
			return true;
		}

		if (message.type === "ping") {
			sendResponse({ status: "pong" });
			return true;
		}

		return false;
	});
}
