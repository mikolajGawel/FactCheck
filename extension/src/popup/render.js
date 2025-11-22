import { countSentences } from "./textUtils.js";

let articlesContainerEl = null;
let startBtnEl = null;
let titleTextEl = null;

let _progressInterval = null;
let _progressStart = 0;
let _progressDuration = 0;

const progressState = {
	mode: "idle", // idle | determinate | indeterminate
	estimateSeconds: null,
	estimateSentences: null,
	startedAt: 0
};

export function initRender(elements = {}) {
	articlesContainerEl = elements.articlesContainer;
	startBtnEl = elements.startBtn;
	titleTextEl = elements.titleText;
}

export function escapeHtml(s) {
	return (s || "").replace(/[&<>\"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function showLongArticleWarning(count) {
	clearLongArticleWarning();
	const warn = document.createElement("div");
	warn.id = "longArticleWarning";
	warn.className = "warning";
	warn.innerHTML = `Artykuł jest za długi i nie może zostać w całości przetworzony.`;
	const container = document.querySelector(".container");
	if (container) container.insertBefore(warn, container.querySelector(".controls"));
}

export function clearLongArticleWarning() {
	const existing = document.getElementById("longArticleWarning");
	if (existing) existing.remove();
}

export function renderArticles(list, onSelect, processedIds = new Set()) {
	stopProgressAnimation(false, true);
	if (!articlesContainerEl) return;
	articlesContainerEl.innerHTML = "";
	if (!list || !list.length) {
		articlesContainerEl.innerHTML =
			'<div class="loading">Na stronie nie znaleziono elementu z artykułem: &lt;article&gt;.</div>';
		if (startBtnEl) startBtnEl.disabled = true;
		return;
	}

	list.forEach(a => {
		const node = document.createElement("div");
		node.className = "article-item";
		if (processedIds.has(a.id)) {
			node.classList.add("processed");
		}
		node.tabIndex = 0;
		node.dataset.id = a.id;
		node.innerHTML = `
            <div style="flex:1">
                <div class="article-title">${escapeHtml(a.title)}</div>
                <div class="article-meta">${escapeHtml(a.snippet)}</div>
            </div>`;
		node.addEventListener("click", () => onSelect(a.id, node));
		node.addEventListener("keydown", ev => {
			if (ev.key === "Enter" || ev.key === " ") {
				ev.preventDefault();
				onSelect(a.id, node);
			}
		});
		articlesContainerEl.appendChild(node);
	});

	if (startBtnEl) {
		startBtnEl.style.display = "flex";
		startBtnEl.disabled = true;
	}
}

export function formatTimeSeconds(sec) {
	if (!Number.isFinite(sec) || sec <= 0) return "0s";
	if (sec < 60) return `${Math.round(sec)}s`;
	const m = Math.floor(sec / 60);
	const s = Math.round(sec % 60);
	return `${m}m ${s}s`;
}

export function computeEstimateSecondsFromArticle(article) {
	const snippet = (article?.snippet || "").trim();
	let sentences = 0;
	try {
		sentences = countSentences(snippet || "");
	} catch (e) {
		sentences = snippet ? Math.max(1, (snippet.match(/[.!?]+/g) || []).length) : 1;
	}
	const secondsPerSentence = 0.2; // ~0.2s per sentence
	const estimatedSeconds = Math.max(1, Math.round(sentences * secondsPerSentence));
	progressState.estimateSentences = sentences;
	return estimatedSeconds;
}

export function startProgressAnimation(totalSeconds, startedAt = Date.now()) {
	stopProgressAnimation();
	_progressDuration = Math.max(1, totalSeconds);
	_progressStart = startedAt;
	const bar = articlesContainerEl?.querySelector(".progress-bar");
	const estimateLabel = articlesContainerEl?.querySelector(".estimate");
	if (estimateLabel) {
		const sentencesPart = progressState.estimateSentences ? ` — ${progressState.estimateSentences} zdań` : "";
		estimateLabel.innerHTML = `Przewidywany czas: <span class="estimate-time">${formatTimeSeconds(_progressDuration)}</span>${sentencesPart}`;
	}

	function tick() {
		const elapsed = (Date.now() - _progressStart) / 1000;
		const pct = Math.min(100, Math.round((elapsed / _progressDuration) * 100));
		if (bar) bar.style.width = pct + "%";
		if (elapsed >= _progressDuration) {
			if (bar) bar.style.width = "99%";
			clearInterval(_progressInterval);
			_progressInterval = null;
			return;
		}
	}

	tick();
	_progressInterval = setInterval(tick, 250);
}

export function stopProgressAnimation(completed, resetState = false) {
	if (_progressInterval) {
		clearInterval(_progressInterval);
		_progressInterval = null;
	}
	const bar = articlesContainerEl?.querySelector(".progress-bar");
	if (bar && completed) {
		bar.style.width = "100%";
		const estimateLabel = articlesContainerEl?.querySelector(".estimate");
		if (estimateLabel) estimateLabel.textContent = "Zakończono";
	}
	if (resetState) {
		progressState.mode = "idle";
		progressState.estimateSeconds = null;
		progressState.startedAt = 0;
	}
}

export function renderInProgress(startTime, estimatedDuration) {
	if (!articlesContainerEl || !startBtnEl || !titleTextEl) return;

	if (startTime && estimatedDuration) {
		progressState.mode = "determinate";
		progressState.estimateSeconds = estimatedDuration;
		progressState.startedAt = startTime;
	}

	// If we already have a determinate estimate running, show determinate progress
	const shouldShowDeterminate = progressState.mode === "determinate" && progressState.startedAt;
	if (shouldShowDeterminate) {
		articlesContainerEl.innerHTML = `
            <div class="state">
                <img src="inprogress.gif">
                <div class="progress-wrap"><div class="progress-bar"></div></div>
                <div class="estimate">Przewidywany czas: <span class="estimate-time">${formatTimeSeconds(progressState.estimateSeconds)}</span>${progressState.estimateSentences ? ` — ${progressState.estimateSentences} zdań` : ""}</div>
            </div>`;
		startBtnEl.style.display = "none";
		titleTextEl.textContent = "Analiza w toku";
		startProgressAnimation(progressState.estimateSeconds, progressState.startedAt);
		return;
	}

	progressState.mode = "indeterminate";
	startBtnEl.style.display = "none";
	articlesContainerEl.innerHTML = `
        <div class="state">
            <img src="inprogress.gif">
            <div class="progress-wrap progress-indeterminate"><div class="progress-bar"></div></div>
            <div class="estimate">Oczekiwanie…</div>
        </div>`;
	titleTextEl.textContent = "Analiza w toku";
}

export function renderInProgressWithEstimate(article, startTime = Date.now()) {
	if (!articlesContainerEl || !startBtnEl || !titleTextEl) return;
	const est = computeEstimateSecondsFromArticle(article);

	progressState.mode = "determinate"; 
	progressState.estimateSeconds = est;
	progressState.startedAt = startTime;

	articlesContainerEl.innerHTML = `
		<div class="state">
			<img src="inprogress.gif">
			<div class="progress-wrap"><div class="progress-bar"></div></div>
			<div class="estimate">Przewidywany czas: <span class="estimate-time">${formatTimeSeconds(est)}</span>${progressState.estimateSentences ? ` — ${progressState.estimateSentences} zdań` : ""}</div>
		</div>`;
	startBtnEl.style.display = "none";
	titleTextEl.textContent = "Analiza w toku";
	startProgressAnimation(est, progressState.startedAt);
}

export function renderCompleted() {
	stopProgressAnimation(true, true);
	if (!articlesContainerEl || !startBtnEl || !titleTextEl) return;
	articlesContainerEl.innerHTML = '<div class="state"><img src="completed.png"></div>';
	startBtnEl.style.display = "none";
	titleTextEl.innerHTML = "Analiza zakończona";
}

export function renderOtherPendingProgress() {
	stopProgressAnimation(false, true);
	if (!articlesContainerEl || !startBtnEl || !titleTextEl) return;
	articlesContainerEl.innerHTML = '<div class="state"><img src="inprogress.gif"></div>';
	startBtnEl.style.display = "none";
	titleTextEl.innerHTML = `\n            Na innej stronie trwa już analiza.<br>\n            <span class="secondary-text">Musisz poczekać na zakończenie tamtego procesu.</span>`;
}

export function renderError(errorMessage) {
	stopProgressAnimation(false, true);
	if (!articlesContainerEl || !startBtnEl || !titleTextEl) return;
	articlesContainerEl.innerHTML = '<div class="state"><img src="error.png" style="width:64px"></div>';
	startBtnEl.style.display = "none";
	titleTextEl.innerHTML = `\n        Błąd<br>\n        <span class="secondary-text">${escapeHtml(errorMessage)}</span>`;
}
