const serverAddress = "http://localhost:3000";

/*
  This content script listens for a message `{ type: "startJob" }` from the
  background/service worker and only then starts executing `runJob()`.
*/

async function runJob() {
	const pageContent = document.documentElement.innerText.trim();

	const start = await fetch(`${serverAddress}/start`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ content: pageContent })
	});

	const { job_id } = await start.json();

	let done = false;
	while (!done) {
		const statusRes = await fetch(`${serverAddress}/status?id=${job_id}`);
		const status = await statusRes.json();
		if (status.status === "done") {
			console.log("Wynik:", status.result);
			done = true;
		} else {
			console.log("Czekam...");
			await new Promise(r => setTimeout(r, 2000));
		}
	}
}

// Prevent double injection and multiple listeners in case the script was injected multiple times
if (window.__FactCheck_injected) {
	// Already initialized
} else {
	window.__FactCheck_injected = true;

	// Listen for runtime messages. Start the job when we receive the 'startJob' message.
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message && message.type === "startJob") {
			// Run the job in the background; don't block the sender.
			runJob().catch(err => console.error("runJob error:", err));
			// Optionally respond immediately
			sendResponse({ status: "job_started" });
			// Must return true to indicate we'll call sendResponse asynchronously in some cases
			return true;
		}
		return false;
	});

	// (Optional) Expose a quick health ping listener if needed by dev tools
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		if (message && message.type === "ping") {
			sendResponse({ status: "pong" });
			return true;
		}

		return false;
	});
}
