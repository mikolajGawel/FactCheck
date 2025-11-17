/**
 * Stany:
 * 0: idle
 * 1: progress
 * 2: completed
 * -1: error
 */
let jobState = 0;
// We need to keep track of the last active tab ID to know which state to reset
let activeTabId = null;

// --- 1. RESET JOB STATE ON TAB URL CHANGE (NEW CARD/NAVIGATION) ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Only reset if the tab is currently active and the URL has changed
    if (changeInfo.url && tabId === activeTabId) {
        console.log(`Tab ${tabId} navigated to new URL: ${changeInfo.url}. Resetting jobState.`);
        jobState = 0;
        chrome.runtime.sendMessage({ type: "stateUpdated", jobState: 0 });
    }
});

// --- 2. RESET JOB STATE ON TAB SWITCH ---
chrome.tabs.onActivated.addListener((activeInfo) => {
    const newTabId = activeInfo.tabId;
    
    // Only proceed if the active tab is actually changing
    if (newTabId !== activeTabId) {
        console.log(`Switched from Tab ${activeTabId} to Tab ${newTabId}. Resetting jobState.`);
        
        // Reset the state for the newly activated tab
        jobState = 0;
        activeTabId = newTabId;
        
        // Notify the popup/other parts that the state has reset for the new active tab
        chrome.runtime.sendMessage({ type: "stateUpdated", jobState: 0 });
        
        // You might want to get the actual state of the job on the newly active tab
        // by sending a message to its content script here, but for simple reset, 
        // this is sufficient.
    }
});

// --- 3. INITIAL ACTIVE TAB SETUP ---
// Find the currently active tab when the extension loads/reloads
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length > 0) {
        activeTabId = tabs[0].id;
    }
});
// -----------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // --- 4. POPUP REQUESTS STATE ---
    if (message.type === "getJobState") {
        sendResponse({
            jobState: jobState
        });
        return true; 
    }

    // --- 5. POPUP/JOB UPDATES STATE ---
    if (message.type === "setJobState") {
        jobState = message.jobState;
        // The sender.tab.id might be useful here if you decide to store 
        // state per-tab, but for a global reset, this is fine.
    }

    // --- 6. JOB COMPLETION (from Content Script) ---
    if (message.type === "jobCompleted") {
        jobState = 2; // Set to Completed
        chrome.runtime.sendMessage({ type: "stateUpdated", jobState: 2 }); 
    }
    
    if (message.type === "jobFailed") {
        jobState = -1; 
        
        chrome.runtime.sendMessage({ 
            type: "stateUpdated", 
            jobState: -1, 
            error: message.error 
        });
        
    }
});

// ... (chrome.action.onClicked listener remains the same)