
let globalJob = {
    running: false,
    tabId: null
};


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    if (message.type === "getGlobalJobState") {
        sendResponse({
            running: globalJob.running,
            tabId: globalJob.tabId
        });
        return true;
    }

    if (message.type === "setJobState") {

        if (message.jobState === 1) {

            if (globalJob.running) {
                sendResponse({
                    ok: false,
                    reason: "another_job_running",
                    tabId: globalJob.tabId
                });
                return true;
            }

            globalJob.running = true;
            globalJob.tabId = message.tabId;

            chrome.runtime.sendMessage({
                type: "stateUpdated",
                jobState: 1,
                tabId: message.tabId
            });

            sendResponse({ ok: true });
            return true;
        }

        // Job zakończony / nieudany / reset
        if (message.jobState === 0 || message.jobState === 2 || message.jobState === -1) {
            globalJob.running = false;
            globalJob.tabId = null;

            chrome.runtime.sendMessage({
                type: "stateUpdated",
                jobState: message.jobState,
                tabId: message.tabId
            });

            sendResponse({ ok: true });
            return true;
        }
    }

    // --- JOB COMPLETED ---
    if (message.type === "jobCompleted") {
        globalJob.running = false;
        globalJob.tabId = null;

        chrome.runtime.sendMessage({
            type: "stateUpdated",
            jobState: 2,
            tabId: sender.tab.id
        });
        return true;
    }

    // --- JOB FAILED ---
    if (message.type === "jobFailed") {
        globalJob.running = false;
        globalJob.tabId = null;

        chrome.runtime.sendMessage({
            type: "stateUpdated",
            jobState: -1,
            tabId: sender.tab.id,
            error: message.error
        });
        return true;
    }

});
// zabezpieczenie na wypadek zamknięcia taba z procesem
chrome.tabs.onRemoved.addListener(tabId => {
    if (globalJob.running && globalJob.tabId === tabId) {
        console.log("Job tab closed — clearing global state");
        globalJob.running = false;
        globalJob.tabId = null;

        chrome.runtime.sendMessage({
            type: "stateUpdated",
            jobState: 0,
            tabId
        });
    }
});
//zabezpieczenie na wypadek przeładowania taba z procesem
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!globalJob.running) return;
    if (globalJob.tabId === tabId && changeInfo.url) {
        console.log("Job tab navigated to new URL — clearing global state");
        globalJob.running = false;
        globalJob.tabId = null;

        chrome.runtime.sendMessage({
            type: "stateUpdated",
            jobState: 0,
            tabId
        });
        return;
    }
    if (globalJob.tabId === tabId && changeInfo.status === "loading") {
        console.log("Job tab reloaded — clearing global state");
        globalJob.running = false;
        globalJob.tabId = null;

        chrome.runtime.sendMessage({
            type: "stateUpdated",
            jobState: 0,
            tabId
        });
    }
});
