const articlesContainer = document.getElementById("articlesContainer");
const startBtn = document.getElementById("startBtn");
const titleText = document.getElementById("popupTitle");

let selectedId = null;
let articles = [];
let jobState = 0; // 0: idle, 1: progress, 2: completed, -1: error
let _progressInterval = null;
let _progressStart = 0;
let _progressDuration = 0;

function escapeHtml(s) {
	return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const PROTECTED_ABBREVIATIONS = [
	"dr", "inż", "mgr", "prof", "hab", "hab\.", "hab\\", "dot", "s", "ul", "al", "ks", "pl", "ppłk", "płk", "gen", "mjr", "por", "ppor", "kpt", "st", "plk", "św", "r","tyś","tys", "mln", "mld","oprac","prok"
];

function protectDots(text) {
	let result = text;
	for (const abbr of PROTECTED_ABBREVIATIONS) {
		if (abbr === "r") {
			result = result.replace(/\br\.(?=\s+[A-ZĄĆĘŁŃÓŚŹŻ])/g, "r.");
			result = result.replace(/\br\.(?=\s+[^A-ZĄĆĘŁŃÓŚŹŻ])/g, "r§");
			continue;
		}
		const re = new RegExp(`\\b${abbr}\\.(?=\\s|$)`, "gi");
		result = result.replace(re, m => m.slice(0, -1) + "§");
	}
	result = result.replace(/(\d)\.(\d)/g, "$1§$2");
	return result;
}

function restoreProtectedDots(text) {
	return text.replace(/§/g, ".");
}

function countSentences(text) {
	if (!text || !text.trim()) return 0;
	const protectedText = protectDots(text);

	if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
		try {
			const seg = new Intl.Segmenter(navigator.language || "en", { granularity: "sentence" });
			let count = 0;
			for (const s of seg.segment(protectedText)) {
				const t = restoreProtectedDots(s.segment.trim());
				if (t) count += 1;
			}
			return count;
		} catch (e) {
		}
	}

	const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
	let m;
	let c = 0;
	while ((m = re.exec(protectedText)) !== null) {
		const t = restoreProtectedDots(m[0].trim());
		if (t) c += 1;
	}
	return c;
}

function showLongArticleWarning(count) {
	clearLongArticleWarning();
	const warn = document.createElement("div");
	warn.id = "longArticleWarning";
	warn.className = "warning";
	warn.innerHTML = `Artykuł jest za długi i może nie zostać w całości przetworzony.`;
	const container = document.querySelector(".container");
	if (container) container.insertBefore(warn, container.querySelector('.controls'));
}

function clearLongArticleWarning() {
	const existing = document.getElementById("longArticleWarning");
	if (existing) existing.remove();
}
async function queryActiveTab() {
	return new Promise(resolve => {
		chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
			resolve(tabs[0]);
		});
	});
}

/* -----------------------------
   STATE MANAGEMENT
----------------------------- */
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

/* -----------------------------
   UI RENDERING
----------------------------- */
function renderArticles(list) {
	stopProgressAnimation(false, true);
	articlesContainer.innerHTML = "";
	if (!list.length) {
		articlesContainer.innerHTML = '<div class="loading">Na stronie nie znaleziono elementu z artykułem: &lt;article&gt;.</div>';
		startBtn.disabled = true;
		return;
	}

	list.forEach(a => {
		const node = document.createElement("div");
		node.className = "article-item";
		node.tabIndex = 0;
		node.dataset.id = a.id;
		node.innerHTML = `
            <div style="flex:1">
                <div class="article-title">${escapeHtml(a.title)}</div>
                <div class="article-meta">${escapeHtml(a.snippet)}</div>
            </div>`;
		node.addEventListener("click", () => selectArticle(a.id, node));
		node.addEventListener("keydown", ev => {
			if (ev.key === "Enter" || ev.key === " ") {
				ev.preventDefault();
				selectArticle(a.id, node);
			}
		});
		articlesContainer.appendChild(node);
	});

	selectedId = null;
	startBtn.style.display = "flex";
	startBtn.disabled = true;
}

async function selectArticle(id, node) {
	if (jobState === 1) return;
	selectedId = id;
	Array.from(articlesContainer.querySelectorAll(".article-item")).forEach(el => el.classList.remove("selected"));
	node.classList.add("selected");

	clearLongArticleWarning();

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
			showLongArticleWarning(sentenceCount);
			startBtn.disabled = true;
		} else {
			clearLongArticleWarning();
			startBtn.disabled = false;
		}
	});
}

const progressState = {
	mode: "idle", // idle | determinate | indeterminate
	estimateSeconds: null,
	startedAt: 0
};

function resetProgressState() {
	progressState.mode = "idle";
	progressState.estimateSeconds = null;
	progressState.startedAt = 0;
}

function renderInProgress({ forceIndeterminate = false } = {}) {
	const shouldShowDeterminate = !forceIndeterminate && progressState.mode === "determinate" && progressState.startedAt;
	if (shouldShowDeterminate) {
		articlesContainer.innerHTML = `
			<div class="state">
				<img src="inprogress.gif">
				<div class="progress-wrap"><div class="progress-bar"></div></div>
				<div class="estimate">Przewidywany czas: <span class="estimate-time">${formatTimeSeconds(
					progressState.estimateSeconds
				)}</span></div>
			</div>`;
		startBtn.style.display = "none";
		titleText.textContent = "Analiza w toku";
		startProgressAnimation(progressState.estimateSeconds, progressState.startedAt);
		return;
	}

	progressState.mode = "indeterminate";
	articlesContainer.innerHTML = `
		<div class="state">
			<img src="inprogress.gif">
			<div class="progress-wrap progress-indeterminate"><div class="progress-bar"></div></div>
			<div class="estimate">Oczekiwanie…</div>
		</div>`;
	startBtn.style.display = "none";
	titleText.textContent = "Analiza w toku";
}

function formatTimeSeconds(sec) {
	if (!Number.isFinite(sec) || sec <= 0) return "0s";
	if (sec < 60) return `${Math.round(sec)}s`;
	const m = Math.floor(sec / 60);
	const s = Math.round(sec % 60);
	return `${m}m ${s}s`;
}

function computeEstimateSecondsFromArticle(article) {
	const snippet = (article?.snippet || "").trim();
	const words = snippet ? snippet.split(/\s+/).filter(Boolean).length : 40;
	const est = Math.max(6, Math.round(6 + words * 0.6));
	return est;
}

function startProgressAnimation(totalSeconds, startedAt = Date.now()) {
	stopProgressAnimation();
	_progressDuration = Math.max(1, totalSeconds);
	_progressStart = startedAt;
	const bar = articlesContainer.querySelector(".progress-bar");
	const estimateLabel = articlesContainer.querySelector(".estimate");
	if (estimateLabel)
		estimateLabel.innerHTML = `Przewidywany czas: <span class="estimate-time">${formatTimeSeconds(
			_progressDuration
		)}</span>`;

	function tick() {
		const elapsed = (Date.now() - _progressStart) / 1000;
		const pct = Math.min(100, Math.round((elapsed / _progressDuration) * 100));
		if (bar) bar.style.width = pct + "%";
		if (elapsed >= _progressDuration) {
			// keep at 99% until we get confirmation
			if (bar) bar.style.width = "99%";
			clearInterval(_progressInterval);
			_progressInterval = null;
			return;
		}
	}

	tick();
	_progressInterval = setInterval(tick, 250);
}

function stopProgressAnimation(completed, resetState = false) {
	if (_progressInterval) {
		clearInterval(_progressInterval);
		_progressInterval = null;
	}
	const bar = articlesContainer.querySelector(".progress-bar");
	if (bar && completed) {
		bar.style.width = "100%";
		const estimateLabel = articlesContainer.querySelector(".estimate");
		if (estimateLabel) estimateLabel.textContent = "Zakończono";
	}
	if (resetState) {
		resetProgressState();
	}
}

function renderInProgressWithEstimate(article) {
	const est = computeEstimateSecondsFromArticle(article);
	progressState.mode = "determinate";
	progressState.estimateSeconds = est;
	progressState.startedAt = Date.now();
	articlesContainer.innerHTML = `
		<div class="state">
			<img src="inprogress.gif">
			<div class="progress-wrap"><div class="progress-bar"></div></div>
			<div class="estimate">Przewidywany czas: <span class="estimate-time">${formatTimeSeconds(est)}</span></div>
		</div>`;
	startBtn.style.display = "none";
	titleText.textContent = "Analiza w toku";
	startProgressAnimation(est, progressState.startedAt);
}

function renderCompleted() {
	stopProgressAnimation(true, true);
	articlesContainer.innerHTML = '<div class="state"><img src="completed.png"></div>';
	startBtn.style.display = "none";
	titleText.innerHTML = "Analiza zakończona";
}

function renderOtherPendingProgress() {
	stopProgressAnimation(false, true);
	articlesContainer.innerHTML = '<div class="state"><img src="inprogress.gif"></div>';
	startBtn.style.display = "none";
	titleText.innerHTML = `
            Na innej stronie trwa już analiza.<br>
			<span class="secondary-text">Musisz poczekać na zakończenie tamtego procesu.</span>`;
}

function renderError(errorMessage) {
	stopProgressAnimation(false, true);
	articlesContainer.innerHTML = '<div class="state"><img src="error.png" style="width:64px"></div>';
	startBtn.style.display = "none";
	titleText.innerHTML = `
		Błąd<br>
		<span class="secondary-text">${escapeHtml(errorMessage)}</span>`;
}

/* -----------------------------
   LOAD ARTICLES
----------------------------- */
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

	// render based on jobState
	if (jobState === 1) {
		renderInProgress();
		return;
	}
	if (jobState === 2) {
		renderCompleted();
		return;
	}
	if (jobState === -1) {
		renderError("Ostatnie zadanie nie powiodło się.");
		return;
	}

	const ok = await ensureContentScript(tab.id);
	if (!ok) {
		articlesContainer.innerHTML = '<div class="loading">Błąd. Wstrzyknięcie skrytpu nie powiodoło się.</div>';
		startBtn.disabled = true;
		return;
	}

	chrome.tabs.sendMessage(tab.id, { type: "getArticles" }, response => {
		if (chrome.runtime.lastError || !response) {
			articlesContainer.innerHTML = '<div class="loading">Problem z załadowaniem artykułu.</div>';
			startBtn.disabled = true;
			return;
		}
		articles = response.articles ?? [];
		renderArticles(articles);
	});
}

/* -----------------------------
   EVENT LISTENERS
----------------------------- */
startBtn.addEventListener("click", async () => {
	if (selectedId === null) return;

	const tab = await queryActiveTab();
	if (!tab || !tab.id) return;

	const globalState = await new Promise(resolve => {
		chrome.runtime.sendMessage({ type: "getGlobalJobState" }, res => resolve(res));
	});

	if (globalState.running && globalState.tabId !== tab.id) {
		renderOtherPendingProgress();
		return;
	}

	const response = await new Promise(resolve => {
		chrome.runtime.sendMessage(
			{
				type: "setJobState",
				jobState: 1,
				tabId: tab.id
			},
			resolve
		);
	});

	if (!response?.ok && response?.reason === "another_job_running") {
		renderOtherPendingProgress();
		return;
	}

	const article = articles.find(a => a.id === selectedId);
	renderInProgressWithEstimate(article);
	chrome.tabs.sendMessage(tab.id, {
		type: "startJob",
		articleId: selectedId,
		title: article?.title ?? null,
		url: tab.url
	});
});

/* -----------------------------
   RECEIVE STATE UPDATES
----------------------------- */
chrome.runtime.onMessage.addListener(async message => {
	if (message.type !== "stateUpdated") return;

	const tab = await queryActiveTab();
	if (message.tabId !== tab.id) return;

	jobState = message.jobState;

	switch (jobState) {
		case 1:
			renderInProgress();
			break;
		case 2:
			renderCompleted();
			break;
		case -1:
			renderError(message.error || "Błąd");
			break;
		default:
			loadArticles();
			break;
	}
});

/* -----------------------------
   INITIAL LOAD
----------------------------- */

async function fetchAndApplyState() {
	const tab = await queryActiveTab();
	if (!tab || !tab.id) return;

	const globalJob = await new Promise(resolve => {
		chrome.runtime.sendMessage({ type: "getGlobalJobState" }, res => resolve(res));
	});

	if (globalJob.running && globalJob.tabId === tab.id) {
		jobState = 1;
		renderInProgress();
		return;
	}

	if (globalJob.running && globalJob.tabId !== tab.id) {
		jobState = 0;
		startBtn.style.display = "none";
		renderOtherPendingProgress();
		return;
	}

	const state = await getJobState();
	jobState = state;

	switch (jobState) {
		case 1:
			renderInProgress();
			break;
		case 2:
			renderCompleted();
			break;
		case -1:
			renderError("Ostatnie zadanie nie powiodło się.");
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
