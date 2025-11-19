/**
 * Stany:
 * 0: idle
 * 1: progress
 * 2: completed
 * -1: error
 */

let tabJobStates = {}; // przechowuje stan joba dla każdej zakładki
let activeTabId = null; // śledzenie aktywnej karty

/* -------------------------------------------------
   FUNKCJE POMOCNICZE
------------------------------------------------- */
function setJobState(tabId, state) {
	tabJobStates[tabId] = state;
}

function resetJobState(tabId) {
	tabJobStates[tabId] = 0;
}

// wysyła update do wszystkich popupów (broadcast)
function broadcastState(tabId, jobState, error = null) {
	chrome.runtime.sendMessage(
		{
			type: "stateUpdated",
			tabId,
			jobState,
			error
		},
		() => {
			if (chrome.runtime.lastError) {
			}
		}
	);
}

/* -------------------------------------------------
   1. RESET STANU PRZY ZMIANIE URL AKTYWNEJ KARTY OR REFRESH
------------------------------------------------- */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	// when active tab navigates to a new URL
	if (changeInfo.url && tabId === activeTabId) {
		console.log(`Active tab ${tabId} navigated -> resetting job state`);
		resetJobState(tabId);
		broadcastState(tabId, 0);
		return;
	}

	// when a page starts loading (refresh or navigation that doesn't change URL), reset completed->idle
	if (changeInfo.status === "loading") {
		if (tabJobStates[tabId] === 2) {
			console.log(`Tab ${tabId} started loading -> resetting completed state to idle`);
			resetJobState(tabId);
			broadcastState(tabId, 0);
		}
	}
});

/* -------------------------------------------------
   2. AKTYWOWANIE NOWEJ KARTY
------------------------------------------------- */
chrome.tabs.onActivated.addListener(activeInfo => {
	activeTabId = activeInfo.tabId;

	if (tabJobStates[activeTabId] === undefined) {
		tabJobStates[activeTabId] = 0;
	}

	console.log(`Switched to tab ${activeTabId}, state: ${tabJobStates[activeTabId]}`);
	broadcastState(activeTabId, tabJobStates[activeTabId]);
});

/* -------------------------------------------------
   3. INICJALIZACJA AKTYWNEJ KARTY
------------------------------------------------- */
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
	if (tabs.length > 0) {
		activeTabId = tabs[0].id;
		if (tabJobStates[activeTabId] === undefined) {
			tabJobStates[activeTabId] = 0;
		}
	}
});

/* -------------------------------------------------
   4. USUWANIE STANU PRZY ZAMKNIĘCIU KARTY
------------------------------------------------- */
chrome.tabs.onRemoved.addListener(tabId => {
	if (tabJobStates[tabId] !== undefined) {
		delete tabJobStates[tabId];
		console.log(`Tab ${tabId} closed — state removed`);
	}

	if (tabId === activeTabId) {
		activeTabId = null;
	}
});

/* -------------------------------------------------
   5. ODBIÓR WIADOMOŚCI Z POPUP / CONTENT SCRIPT
------------------------------------------------- */
// switched to internal onMessage listener (was onMessageExternal)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const senderTabId = sender.tab?.id;

	// POPUP: pyta o stan zakładki
	if (message.type === "getJobState") {
		const tabId = message.tabId ?? senderTabId ?? activeTabId;
		const state = tabJobStates[tabId] ?? 0;
		sendResponse({ jobState: state });
		return; // synchronous response
	}

	// POPUP: ustawia stan joba
	if (message.type === "setJobState") {
		const tabId = message.tabId ?? senderTabId ?? activeTabId;
		setJobState(tabId, message.jobState);
		broadcastState(tabId, message.jobState);
		return;
	}

	// CONTENT SCRIPT: job zakończony
	if (message.type === "jobCompleted") {
		if (senderTabId) {
			setJobState(senderTabId, 2);
			broadcastState(senderTabId, 2);
			console.log(`Job completed in tab ${senderTabId}`);
		}
		return;
	}

	// CONTENT SCRIPT: job failed
	if (message.type === "jobFailed") {
		const tabId = message.tabId ?? senderTabId;
		if (tabId) {
			setJobState(tabId, -1);
			broadcastState(tabId, -1, message.error);
			console.log(`Job failed in tab ${tabId}: ${message.error}`);
		}
		return;
	}
});
