const articlesContainer = document.getElementById("articlesContainer");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
let selectedId = null;
let articles = [];

async function queryActiveTab() {
	return new Promise(resolve => {
		chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
			resolve(tabs[0]);
		});
	});
}

function renderArticles(list) {
	articlesContainer.innerHTML = "";
	if (!list.length) {
		articlesContainer.innerHTML =
			'<div class="loading">No <code>&lt;article&gt;</code> elements found on the page.</div>';
		startBtn.disabled = true;
		return;
	}

	list.forEach(a => {
		const node = document.createElement("div");
		node.className = "article-item";
		node.tabIndex = 0;
		node.dataset.id = a.id;
		node.innerHTML = `<div style="flex: 1"><div class="article-title">${escapeHtml(
			a.title
		)}</div><div class="article-meta">${escapeHtml(a.snippet)}</div></div>`;
		node.addEventListener("click", () => selectArticle(a.id, node));
		node.addEventListener("keydown", ev => {
			if (ev.key === "Enter" || ev.key === " ") {
				ev.preventDefault();
				selectArticle(a.id, node);
			}
		});
		articlesContainer.appendChild(node);
	});

	// reset selection
	selectedId = null;
	startBtn.disabled = true;
}

function selectArticle(id, node) {
	selectedId = id;
	Array.from(articlesContainer.querySelectorAll(".article-item")).forEach(el => el.classList.remove("selected"));
	node.classList.add("selected");
	startBtn.disabled = false;
	statusEl.textContent = "";
}

function escapeHtml(s) {
	return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function ensureContentScript(tabId) {
	return new Promise((resolve, reject) => {
		// Check if a content script is present by pinging
		chrome.tabs.sendMessage(tabId, { type: "ping" }, res => {
			if (!chrome.runtime.lastError && res && res.status === "pong") {
				resolve(true);
				return;
			}
			// otherwise inject content.js
			try {
				chrome.scripting.executeScript(
					{
						target: { tabId },
						files: ["content.js"]
					},
					() => {
						if (chrome.runtime.lastError) {
							resolve(false);
						} else {
							resolve(true);
						}
					}
				);
			} catch (err) {
				resolve(false);
			}
		});
	});
}

async function loadArticles() {
	const tab = await queryActiveTab();
	if (!tab || !tab.id) return;
	const ok = await ensureContentScript(tab.id);
	// Request articles
	chrome.tabs.sendMessage(tab.id, { type: "getArticles" }, response => {
		if (chrome.runtime.lastError || !response) {
			articlesContainer.innerHTML = '<div class="loading">Failed to collect articles from page.</div>';
			startBtn.disabled = true;
			return;
		}
		articles = response.articles || [];
		renderArticles(articles);
	});
}

startBtn.addEventListener("click", async () => {
	if (selectedId === null) return;
	const tab = await queryActiveTab();
	if (!tab || !tab.id) return;
	startBtn.disabled = true;
	statusEl.textContent = "Starting job…";
	chrome.tabs.sendMessage(tab.id, { type: "startJob", articleId: selectedId }, resp => {
		if (chrome.runtime.lastError) {
			statusEl.textContent = `Failed to start job: ${chrome.runtime.lastError.message}`;
			startBtn.disabled = false;
			return;
		}
		statusEl.textContent = "Job started";
		// Optionally show the selected content snippet
		// disable start button to avoid duplicates
	});
});

loadArticles();
