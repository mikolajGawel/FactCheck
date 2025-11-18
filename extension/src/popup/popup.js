const articlesContainer = document.getElementById("articlesContainer");
const startBtn = document.getElementById("startBtn");
const statusEl = document.getElementById("status");
let selectedId = null;
let articles = [];
// State Codes: 0: idle, 1: progress,2: completed, -1: error
let jobState = 0;

// --- State Management ---

function setJobState(newState) {
    jobState = newState;
    chrome.runtime.sendMessage({
        type: "setJobState",
        jobState: newState
    });
}

async function getJobState() {
    return new Promise(resolve => {
        chrome.runtime.sendMessage({ type: "getJobState" }, response => {
            if (response) {
                resolve(response);
            } else {
                resolve({ jobState: 0 });
            }
        });
    });
}

// --- Utility Functions ---

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
    // FIX: Changed jobInProgress to jobState === 1
    if (jobState === 1) return; 
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
            if (!chrome.runtime.lastError && res && res.status && res.status === "pong") {
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

// --- UI Rendering ---

function renderInProgress() {
    // Set job state to 1 (Progress)
    setJobState(1); 
    
    articlesContainer.innerHTML = '<div class="state"><img src="inprogress.gif"></div>';
    startBtn.disabled = true;
    statusEl.textContent = "Job running...";
}
function renderCompleted() {
    articlesContainer.innerHTML = '<div class="state"><img src="logo_highres.png"></div>';
    startBtn.disabled = true;
    statusEl.textContent = "Completed...";
}


async function loadArticles() {
    const state = await getJobState();
    jobState = state.jobState;
    
    statusEl.textContent = ""; 
    
    if (jobState === 1) {
        // Job is in progress, show progress UI
        renderInProgress();
        return;
    }
	
	if(jobState === 2){
		renderCompleted();
		return;
	}

    if (jobState === -1) {
        // Job was in error state when popup closed.
        statusEl.textContent = `Job failed during last session.`;
        // Immediately reset persistent state to Idle (0) after displaying error
        setJobState(0); 
    }

    // Now safe to load articles (jobState is 0 or -1, and immediately reset to 0 for -1)
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

// --- Event Listeners ---

startBtn.addEventListener("click", async () => {
    if (selectedId === null) return;
    const tab = await queryActiveTab();
    if (!tab || !tab.id) return;
    
    // Set state to 'progress' and update UI
    renderInProgress(); 

    const article = articles.find(a => a.id === selectedId);
    chrome.tabs.sendMessage(
        tab.id,
        { type: "startJob", articleId: selectedId, title: article?.title ?? null, url: tab.url },
        resp => {
            if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                // Send jobFailed message to trigger the background script to broadcast the state update
                chrome.runtime.sendMessage({ type: "jobFailed", error: errorMsg });
                return;
            }
        }
    );
});

// Listener for messages from the background script (where job state changes are broadcast)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // We listen for 'stateUpdated' from the background, which is broadcast when job is completed/failed
    if (message.type === "stateUpdated") {
        jobState = message.jobState;
        
        if (jobState === 2) {
            statusEl.textContent = "Job completed successfully!";
            loadArticles(); 
        } else if (jobState === -1) {
            // Error message is included in the broadcast only
            statusEl.textContent = `Job failed: ${message.error || 'An unknown error occurred.'}`;
            // Important: We reset the persistent state to Idle (0) after displaying the error,
            // so the next time the popup opens, it doesn't try to reuse the error message.
            setJobState(0);
            loadArticles(); 
        }
    }
});

loadArticles();