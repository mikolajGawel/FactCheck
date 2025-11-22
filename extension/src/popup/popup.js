import { countSentences } from "./textUtils.js";
import * as render from "./render.js";

const articlesContainer = document.getElementById("articlesContainer");
const startBtn = document.getElementById("startBtn");
const titleText = document.getElementById("popupTitle");

let selectedId = null;
let articles = [];
let jobState = 0; // 0: idle, 1: progress, 2: completed, -1: error
let processedIds = new Set();

render.initRender({ articlesContainer, startBtn, titleText });

async function queryActiveTab() {
	return new Promise(resolve => {
		chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
			resolve(tabs[0]);
		});
	});
}

async function getProcessedArticles(tabId) {
	return new Promise(resolve => {
		chrome.runtime.sendMessage({ type: "getProcessedArticles", tabId }, response => {
			resolve(new Set(response?.articleIds || []));
		});
	});
}
async function setJobState(newState) {
	jobState = newState;
	const tab = await queryActiveTab();
	chrome.runtime.sendMessage({
		type: "setJobState",
		jobState: newState,
		tabId: tab.id
	});
}

async function getJobState() {
	const tab = await queryActiveTab();
	return new Promise(resolve => {
		chrome.runtime.sendMessage({ type: "getJobState", tabId: tab.id }, response => {
			resolve(response?.jobState ?? 0);
		});
	});
}

async function ensureContentScript(tabId) {
	return new Promise(resolve => {
		chrome.tabs.sendMessage(tabId, { type: "ping" }, res => {
			if (!chrome.runtime.lastError && res?.status === "pong") {
				resolve(true);
				return;
			}
			chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }, () => {
				resolve(!chrome.runtime.lastError);
			});
		});
	});
}

async function loadArticles() {
	const tab = await queryActiveTab();
	if (!tab || !tab.id) return;

	jobState = await getJobState();

	if (jobState === 1) {
		render.renderInProgress();
		return;
	}
	if (jobState === 2) {
		render.renderCompleted();
		return;
	}
	if (jobState === -1) {
		render.renderError("Ostatnie zadanie nie powiodło się.");
		return;
	}

	const ok = await ensureContentScript(tab.id);
	if (!ok) {
		articlesContainer.innerHTML = '<div class="loading">Błąd. Wstrzyknięcie skrytpu nie powiodoło się.</div>';
		startBtn.disabled = true;
		return;
	}

	processedIds = await getProcessedArticles(tab.id);

	chrome.tabs.sendMessage(tab.id, { type: "getArticles" }, response => {
		if (chrome.runtime.lastError || !response) {
			articlesContainer.innerHTML = '<div class="loading">Problem z załadowaniem artykułu.</div>';
			startBtn.disabled = true;
			return;
		}
		articles = response.articles ?? [];
		render.renderArticles(articles, selectArticle, processedIds);
	});
}

async function selectArticle(id, node) {
	if (jobState === 1) return;
	if (processedIds.has(id)) return;

	selectedId = id;
	Array.from(articlesContainer.querySelectorAll(".article-item")).forEach(el => el.classList.remove("selected"));
	node.classList.add("selected");
	render.clearLongArticleWarning();

	const tab = await queryActiveTab();
	if (!tab || !tab.id) {
		startBtn.disabled = true;
		return;
	}

	chrome.tabs.sendMessage(tab.id, { type: "getArticleText", articleId: id }, response => {
		if (chrome.runtime.lastError || !response) {
			startBtn.disabled = true;
			return;
		}

		const text = response.articleText || "";
		const sentenceCount = countSentences(text);
		const LIMIT = 300;
		if (sentenceCount > LIMIT) {
			render.showLongArticleWarning(sentenceCount);
			startBtn.disabled = false;
		} else {
			render.clearLongArticleWarning();
			startBtn.disabled = false;
		}
	});
}

startBtn.addEventListener("click", async () => {
	if (selectedId === null) return;
	if (processedIds.has(selectedId)) return;

	const tab = await queryActiveTab();
	if (!tab || !tab.id) return;
	const globalState = await new Promise(resolve => {
		chrome.runtime.sendMessage({ type: "getGlobalJobState" }, res => resolve(res));
	});

	if (globalState.running && globalState.tabId !== tab.id) {
		render.renderOtherPendingProgress();
		return;
	}

	const article = articles.find(a => a.id === selectedId);
	const estimatedDuration = render.computeEstimateSecondsFromArticle(article);
	const startTime = Date.now();

	const response = await new Promise(resolve => {
		chrome.runtime.sendMessage(
			{
				type: "setJobState",
				jobState: 1,
				tabId: tab.id,
				startTime,
				estimatedDuration
			},
			resolve
		);
	});

	if (!response?.ok && response?.reason === "another_job_running") {
		render.renderOtherPendingProgress();
		return;
	}

	render.renderInProgressWithEstimate(article, startTime);
	chrome.tabs.sendMessage(tab.id, {
		type: "startJob",
		articleId: selectedId,
		title: article?.title ?? null,
		url: tab.url
	});
});

chrome.runtime.onMessage.addListener(async message => {
	if (message.type !== "stateUpdated") return;
	const tab = await queryActiveTab();
	if (message.tabId !== tab.id) return;

	jobState = message.jobState;

	if (jobState === 2 && typeof message.articleId === "number") {
		processedIds.add(message.articleId);
	}

	switch (jobState) {
		case 1:
			render.renderInProgress();
			break;
		case 2:
			render.renderCompleted();
			break;
		case -1:
			render.renderError(message.error || "Błąd");
			break;
		default:
			loadArticles();
			break;
	}
});

async function fetchAndApplyState() {
	const tab = await queryActiveTab();
	if (!tab || !tab.id) return;

	const globalJob = await new Promise(resolve => {
		chrome.runtime.sendMessage({ type: "getGlobalJobState" }, res => resolve(res));
	});

	if (globalJob.running && globalJob.tabId === tab.id) {
		jobState = 1;
		render.renderInProgress(globalJob.startTime, globalJob.estimatedDuration);
		return;
	}

	if (globalJob.running && globalJob.tabId !== tab.id) {
		jobState = 0;
		startBtn.style.display = "none";
		render.renderOtherPendingProgress();
		return;
	}

	const state = await getJobState();
	jobState = state;

	switch (jobState) {
		case 1:
			render.renderInProgress();
			break;
		case 2:
			render.renderCompleted();
			break;
		case -1:
			render.renderError("Ostatnie zadanie nie powiodło się.");
			break;
		default:
			loadArticles();
			break;
	}
}

document.addEventListener("DOMContentLoaded", fetchAndApplyState);
window.addEventListener("focus", fetchAndApplyState);
document.addEventListener("visibilitychange", () => {
	if (!document.hidden) fetchAndApplyState();
});
