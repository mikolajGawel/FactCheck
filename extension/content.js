const serverAddress = "http://localhost:3000";

/*
  This content script listens for a message `{ type: "startJob" }` from the
  background/service worker and only then starts executing `runJob()`.
*/

/**
 * @async
 * @param {string} [textContent] Optional text content to process. When omitted, the entire page text is used.
 * @returns {Promise<void>} Resolves when the server reports the job is complete. Does not return job result (it logs it).
 */
async function runJob(textContent) {
	const pageContent = typeof textContent === "string" ? textContent : document.documentElement.innerText.trim();

	const start = await fetch(`${serverAddress}/start`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ content: pageContent })
	});

	const { job_id } = await start.json();

	let done = false;
	while (!done) {
		const statusRes = await fetch(`${serverAddress}/status?id=${job_id}`);
		const status = await statusRes.json();
		if (status.status === "done") {
			console.log("Wynik:", status.result);
			done = true;
		} else {
			console.log("Czekam...");
			await new Promise(r => setTimeout(r, 2000));
		}
	}
}

// Prevent double injection and multiple listeners in case the script was injected multiple times
if (window.__FactCheck_injected) {
	// Already initialized
} else {
	window.__FactCheck_injected = true;

	// Listen for runtime messages. Start the job when we receive the 'startJob' message.
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (!message || !message.type) return false;

		if (message.type === "startJob") {
			// message can contain { articleId } or { content }
			if (message.articleId !== undefined) {
				const text = collectArticleText(message.articleId);
				runJob(text).catch(err => console.error("runJob error:", err));
			} else if (message.content) {
				runJob(message.content).catch(err => console.error("runJob error:", err));
			} else {
				// fallback to whole page
				runJob().catch(err => console.error("runJob error:", err));
			}
			sendResponse({ status: "job_started" });
			return true;
		}

		// ask for list of articles
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

		return false;
	});

	// (Optional) Expose a quick health ping listener if needed by dev tools
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message && message.type === "ping") {
			sendResponse({ status: "pong" });
			return true;
		}

		return false;
	});
}

function collectArticles() {
	const nodes = Array.from(document.querySelectorAll("article"));
	return nodes.map((node, idx) => {
		const title = findArticleTitle(node) || `Article ${idx + 1}`;
		const clean = extractArticleBody(node);
		const snippet = clean.slice(0, 200).replace(/\s+/g, " ");
		return { id: idx, title, snippet };
	});
}

function collectArticleText(articleId) {
	const nodes = Array.from(document.querySelectorAll("article"));
	const node = nodes[articleId];
	if (!node) return document.documentElement.innerText.trim();
	return extractArticleBody(node);
}

function extractArticleBody(articleNode) {
	if (!articleNode) return "";
	const clone = articleNode.cloneNode(true);
	const noiseSelectors = "aside, button, script";
	const noiseNodes = clone.querySelectorAll(noiseSelectors);
	noiseNodes.forEach(el => el.remove());
	return (clone.innerText || "").trim();
}

function findArticleTitle(articleNode) {
	if (!articleNode) return null;
	// prefer the highest-level header
	for (let level = 1; level <= 6; level++) {
		const el = articleNode.querySelector("h" + level);
		if (el && el.innerText.trim()) return el.innerText.trim();
	}

	// fallback to aria-label or data-title or first strong/em
	const aria = articleNode.getAttribute("aria-label");
	if (aria) return aria.trim();

	const dataTitle = articleNode.getAttribute("data-title");
	if (dataTitle) return dataTitle.trim();

	const strong = articleNode.querySelector("strong, b");
	if (strong && strong.innerText.trim()) return strong.innerText.trim();

	return null;
}
