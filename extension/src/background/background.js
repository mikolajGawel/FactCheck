/**
 * Stany:
 * 0: idle
 * 1: progress
 * 2: completed
 * -1: error
 */

let tabJobStates = {}; // przechowuje stan joba dla każdej zakładki
let activeTabId = null; // śledzenie aktywnej karty

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (changeInfo.url && tabId === activeTabId) {
		console.log(`Active tab ${tabId} navigated -> resetting job state`);
		resetJobState(tabId);
		broadcastState(tabId, 0);
		return;
	}

	if (changeInfo.status === "loading") {
		if (tabJobStates[tabId] === 2) {
			console.log(`Tab ${tabId} started loading -> resetting completed state to idle`);
			resetJobState(tabId);
			broadcastState(tabId, 0);
		}
	}
});


chrome.tabs.onActivated.addListener(activeInfo => {
	activeTabId = activeInfo.tabId;

	if (tabJobStates[activeTabId] === undefined) {
		tabJobStates[activeTabId] = 0;
	}

	console.log(`Switched to tab ${activeTabId}, state: ${tabJobStates[activeTabId]}`);
	broadcastState(activeTabId, tabJobStates[activeTabId]);
});


chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
	if (tabs.length > 0) {
		activeTabId = tabs[0].id;
		if (tabJobStates[activeTabId] === undefined) {
			tabJobStates[activeTabId] = 0;
		}
	}
});


chrome.tabs.onRemoved.addListener(tabId => {
	if (tabJobStates[tabId] !== undefined) {
		delete tabJobStates[tabId];
		console.log(`Tab ${tabId} closed — state removed`);
	}

	if (tabId === activeTabId) {
		activeTabId = null;
	}
});



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const senderTabId = sender.tab?.id;
	if (message.type === "getJobState") {
		const tabId = message.tabId ?? senderTabId ?? activeTabId;
		const state = tabJobStates[tabId] ?? 0;
		sendResponse({ jobState: state });
		return; // synchronous response
	}

	if (message.type === "setJobState") {
		const tabId = message.tabId ?? senderTabId ?? activeTabId;
		setJobState(tabId, message.jobState);
		broadcastState(tabId, message.jobState);
		return;
	}

	if (message.type === "jobCompleted") {
		if (senderTabId) {
			setJobState(senderTabId, 2);
			broadcastState(senderTabId, 2);
			console.log(`Job completed in tab ${senderTabId}`);
		}
		return;
	}

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
