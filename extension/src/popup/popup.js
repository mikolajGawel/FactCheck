const articlesContainer = document.getElementById("articlesContainer");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");

let selectedId = null;
let articles = [];
let jobState = 0; // 0: idle, 1: progress, 2: completed, -1: error


function escapeHtml(s) {
	return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
	articlesContainer.innerHTML = "";
	if (!list.length) {
		articlesContainer.innerHTML = '<div class="loading">No &lt;article&gt; elements found.</div>';
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

function selectArticle(id, node) {
	if (jobState === 1) return; 
	selectedId = id;
	Array.from(articlesContainer.querySelectorAll(".article-item")).forEach(el => el.classList.remove("selected"));
	node.classList.add("selected");
	startBtn.disabled = false;
	statusEl.textContent = "";
}

function renderInProgress() {
	articlesContainer.innerHTML = '<div class="state"><img src="inprogress.gif"></div>';
	startBtn.style.display = "none";
	statusEl.innerHTML = "<h3>W trakcie analizy...</h3>";
}

function renderCompleted() {
	articlesContainer.innerHTML = '<div class="state"><img src="completed.png"></div>';
	startBtn.style.display = "none";
	statusEl.innerHTML = "<h3>Analiza zakończona</h3>";
}

function renderError(errorMessage) {
	articlesContainer.innerHTML = '<div class="state"><img src="error.png" style="width:64px"></div>';
	startBtn.style.display = "none";
	statusEl.innerHTML = `<h3>Błąd</h3><p>${escapeHtml(errorMessage)}</p>`;
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
        statusEl.innerHTML = `
            <h3 style="color:#d33;">🔒 Na innej stronie trwa już analiza.</h3>
            <p>Musisz poczekać na zakończenie tamtego zadania.</p>
        `;
        return;
    }


    const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({
            type: "setJobState",
            jobState: 1,
            tabId: tab.id
        }, resolve);
    });

    if (!response?.ok && response?.reason === "another_job_running") {
        statusEl.innerHTML = `
            <h3 style="color:#d33;">🔒 Na innej stronie trwa analiza.</h3>
            <p>Poczekaj aż job na karcie ${response.tabId} się zakończy.</p>
        `;
        return;
    }

    renderInProgress();

    const article = articles.find(a => a.id === selectedId);

    chrome.tabs.sendMessage(
        tab.id,
        {
            type: "startJob",
            articleId: selectedId,
            title: article?.title ?? null,
            url: tab.url
        }
    );
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
        articlesContainer.innerHTML = `
            <div class="state">
                <img src="inprogress.gif">
                <h3>Na innej stronie trwa analiza.</h3>
                <p>Wróć do poprzedniej karty aby zobaczyć postęp.</p>
            </div>
        `;
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
