chrome.runtime.onInstalled.addListener(() => {
	console.log("hello world");
});

chrome.action.onClicked.addListener(async tab => {
	if (!tab.id) return;

	// Try to ping the content-scripts if already present on the page.
	chrome.tabs.sendMessage(tab.id, { type: "ping" }, async response => {
		// If there is no receiver, chrome.runtime.lastError will be set
		if (chrome.runtime.lastError || !response) {
			// content script not present — inject it
			try {
				await chrome.scripting.executeScript({
					target: { tabId: tab.id },
					files: ["dist/content.js"]
				});
				// After injecting, send the start message
				chrome.tabs.sendMessage(tab.id, { type: "startJob" });
			} catch (err) {
				console.error("Failed to inject content script:", err);
			}
		} else {
			// Already injected — just trigger the job
			chrome.tabs.sendMessage(tab.id, { type: "startJob" });
		}
	});
});
