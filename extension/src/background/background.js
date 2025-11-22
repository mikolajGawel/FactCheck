let globalJob = {
	running: false,
	tabId: null,
	startTime: null,
	estimatedDuration: null
};

// { [tabId]: { url: string, articleIds: Set<number> } }
let processedArticlesByTab = {};
// Cached server limit (fetched once by background and stored here)
let cachedServerLimit = null;

// Server address and auth (injected at build time via process.env)
const serverAddress = process.env.SERVER ?? "";

function getAuthHeaders() {
	if (typeof serverAddress === "string" && serverAddress.startsWith("https://")) {
		try {
			return { Authorization: "Basic " + btoa(`${process.env.SERVER_USER}:${process.env.SERVER_PASS}`) };
		} catch (e) {
			return {};
		}
	}
	return {};
}

async function fetchAndCacheServerLimit() {
	if (!serverAddress) return null;
	try {
		const res = await fetch(`${serverAddress}/limit`, { method: "GET", headers: { ...(getAuthHeaders() ?? {}) } });
		if (!res.ok) return null;
		const data = await res.json().catch(() => ({}));
		const parsed = Number(data?.max_sentences);
		if (!Number.isNaN(parsed) && parsed > 0) {
			cachedServerLimit = parsed;
			return parsed;
		}
	} catch (e) {
		console.warn("background: failed to fetch server limit", e);
	}
	return null;
}

// Fetch limit at startup (fire-and-forget)
fetchAndCacheServerLimit().catch(() => {});


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "getGlobalJobState") {
		sendResponse({
			running: globalJob.running,
			tabId: globalJob.tabId,
			startTime: globalJob.startTime,
			estimatedDuration: globalJob.estimatedDuration
		});
		return true;
	}

	// Allow background to return cached server limit
	if (message.type === "getServerLimit") {
		sendResponse({ max_sentences: cachedServerLimit });
		return true;
	}

	// Allow manual refresh trigger for limit (optional)
	if (message.type === "refreshServerLimit") {
		fetchAndCacheServerLimit().then(val => sendResponse({ max_sentences: val })).catch(() => sendResponse({ max_sentences: null }));
		return true;
	}

	if (message.type === "getProcessedArticles") {
		const tabId = message.tabId;
		const entry = processedArticlesByTab[tabId];
		sendResponse({
			articleIds: entry ? Array.from(entry.articleIds) : []
		});
		return true;
	}

	if (message.type === "setJobState") {
		if (message.jobState === 1) {
			if (globalJob.running) {
				sendResponse({
					ok: false,
					reason: "another_job_running",
					tabId: globalJob.tabId
				});
				return true;
			}

			globalJob.running = true;
			globalJob.tabId = message.tabId;
			globalJob.startTime = message.startTime || Date.now();
			globalJob.estimatedDuration = message.estimatedDuration || 60;

			chrome.runtime.sendMessage({
				type: "stateUpdated",
				jobState: 1,
				tabId: message.tabId
			});

			sendResponse({ ok: true });
			return true;
		}

		// Job zakończony / nieudany / reset
		if (message.jobState === 0 || message.jobState === 2 || message.jobState === -1) {
			globalJob.running = false;
			globalJob.tabId = null;
			globalJob.startTime = null;
			globalJob.estimatedDuration = null;

			chrome.runtime.sendMessage({
				type: "stateUpdated",
				jobState: message.jobState,
				tabId: message.tabId
			});

			sendResponse({ ok: true });
			return true;
		}
	}

	// --- JOB COMPLETED ---
	if (message.type === "jobCompleted") {
		globalJob.running = false;
		globalJob.tabId = null;
		globalJob.startTime = null;
		globalJob.estimatedDuration = null;

		const tabId = sender.tab.id;
		const articleId = message.articleId;
		const url = message.url || sender.tab.url;

		if (typeof articleId === "number") {
			if (!processedArticlesByTab[tabId]) {
				processedArticlesByTab[tabId] = { url, articleIds: new Set() };
			}
			// If URL changed, reset
			if (processedArticlesByTab[tabId].url !== url) {
				processedArticlesByTab[tabId] = { url, articleIds: new Set() };
			}
			processedArticlesByTab[tabId].articleIds.add(articleId);
		}

		chrome.runtime.sendMessage({
			type: "stateUpdated",
			jobState: 2,
			tabId: tabId,
			articleId: articleId
		});
		return true;
	} // --- JOB FAILED ---
	if (message.type === "jobFailed") {
		globalJob.running = false;
		globalJob.tabId = null;
		globalJob.startTime = null;
		globalJob.estimatedDuration = null;

		chrome.runtime.sendMessage({
			type: "stateUpdated",
			jobState: -1,
			tabId: sender.tab.id,
			error: message.error
		});
		return true;
	}
});
// zabezpieczenie na wypadek zamknięcia taba z procesem
chrome.tabs.onRemoved.addListener(tabId => {
	delete processedArticlesByTab[tabId];

	if (globalJob.running && globalJob.tabId === tabId) {
		console.log("Job tab closed — clearing global state");
		globalJob.running = false;
		globalJob.tabId = null;
		globalJob.startTime = null;
		globalJob.estimatedDuration = null;

		chrome.runtime.sendMessage({
			type: "stateUpdated",
			jobState: 0,
			tabId
		});
	}
});
//zabezpieczenie na wypadek przeładowania taba z procesem
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.url || changeInfo.status === "loading") {
		delete processedArticlesByTab[tabId];
	}

	if (!globalJob.running) return;
	if (globalJob.tabId === tabId && changeInfo.url) {
		console.log("Job tab navigated to new URL — clearing global state");
		globalJob.running = false;
		globalJob.tabId = null;
		globalJob.startTime = null;
		globalJob.estimatedDuration = null;

		chrome.runtime.sendMessage({
			type: "stateUpdated",
			jobState: 0,
			tabId
		});
		return;
	}
	if (globalJob.tabId === tabId && changeInfo.status === "loading") {
		console.log("Job tab reloaded — clearing global state");
		globalJob.running = false;
		globalJob.tabId = null;
		globalJob.startTime = null;
		globalJob.estimatedDuration = null;

		chrome.runtime.sendMessage({
			type: "stateUpdated",
			jobState: 0,
			tabId
		});
	}
});
