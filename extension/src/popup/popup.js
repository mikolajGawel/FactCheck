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
    // Wysyłaj wiadomość do background.js (który teraz zapisuje stan per-tab)
    chrome.runtime.sendMessage({
        type: "setJobState",
        jobState: newState
    });
}

async function getJobState() {
    return new Promise(resolve => {
        // Background.js odpowie stanem dla AKTYWNEJ zakładki
        chrome.runtime.sendMessage({ type: "getJobState" }, response => {
            if (response && response.jobState !== undefined) {
                resolve(response);
            } else {
                resolve({ jobState: 0 });
            }
        });
    });
}

// --- Utility Functions (bez zmian) ---

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
    startBtn.style.display = "flex";
    startBtn.disabled = true;
}

function selectArticle(id, node) {
    // FIX: Changed jobInProgress to jobState === 1
    if (jobState === 1) return; 
    selectedId = id;
    Array.from(articlesContainer.querySelectorAll(".article-item")).forEach(el => el.classList.remove("selected"));
    node.classList.add("selected");
    startBtn.style.display = "flex";

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
    // NIE WYSYŁAJ setJobState(1) TUTAJ! 
    // Zostanie to wysłane, gdy user kliknie StartBtn, aby uniknąć problemów z otwieraniem popupu
    // podczas wykonywania akcji startowej.
    
    articlesContainer.innerHTML = '<div class="state"><img src="inprogress.gif"></div>';
    startBtn.disabled = true;
    statusEl.innerHTML = "<h3>W trakcie analizy</h3>";
    startBtn.style.display = "none";
}

function renderCompleted() {
    articlesContainer.innerHTML = '<div class="state"><img src="completed.png"></div>';
    startBtn.disabled = true;
    statusEl.innerHTML = "<h3>Ukończono analizowanie artykułu</h3>";

    startBtn.style.display = "none";
}

function renderError(errorMessage) {
     articlesContainer.innerHTML = '<div class="state"><img src="error.png" style="width: 64px;"></div>';
     startBtn.disabled = true;
     statusEl.innerHTML = `<h3>Błąd</h3><p>${errorMessage}</p>`;
     startBtn.style.display = "none";
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
        // Job was in error state. Pokaż błąd. 
        // Stan per-tab pozostaje -1, aż do nawigacji/przełączenia zakładki/ręcznego resetu.
        renderError(`Ostatnie zadanie nie powiodło się.`);
        // Nie wywołuj setJobState(0) - stan per-tab jest teraz zarządzany przez background.js!
        return;
    }

    // Now safe to load articles (jobState is 0 or error state which is handled above)
    const tab = await queryActiveTab();
    if (!tab || !tab.id) return;
    const ok = await ensureContentScript(tab.id);
    
    // Request articles
    chrome.tabs.sendMessage(tab.id, { type: "getArticles" }, response => {
        if (chrome.runtime.lastError || !response) {
            articlesContainer.innerHTML = '<div class="loading">Failed to collect articles from page.</div>';
            startBtn.style.display = "flex";

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
    
    // Ustaw stan na 'progress' w tle PRZED wysłaniem wiadomości do content.js/jobRunner.js
    setJobState(1);
    renderInProgress(); 

    const article = articles.find(a => a.id === selectedId);
    chrome.tabs.sendMessage(
        tab.id,
        // Wysłanie wiadomości do content.js, aby rozpocząć proces
        { type: "startJob", articleId: selectedId, title: article?.title ?? null, url: tab.url },
        resp => {
            if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message;
                // Send jobFailed message to trigger the background script to broadcast the state update
                chrome.runtime.sendMessage({ type: "jobFailed", error: errorMsg });
                // W tym momencie background.js zaktualizuje stan na -1, a stateUpdated go obsłuży.
                return;
            }
        }
    );
});

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
            // Teraz po prostu polegaj na loadArticles, aby ponownie załadować interfejs 
            // w stanie błędu (-1), co teraz poprawnie renderuje błąd.
            loadArticles(); 
        } else if (jobState === 0) {
            // Stan resetu. Wczytaj UI od nowa.
            loadArticles();
        }
    }
});

loadArticles();