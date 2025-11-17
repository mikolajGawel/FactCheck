import { highlightText } from "./factHighlight.js";

const serverAddress = process.env.SERVER;

/**
 * @async
 * @param {string} [textContent] Optional text content to process. When omitted, the entire page text is used.
 * @returns {Promise<void>} Resolves when the server reports the job is complete. Does not return job result (it logs it).
 */
export async function runJob(textContent, meta = {}) {
	const pageContent = typeof textContent === "string" ? textContent : document.documentElement.innerText.trim();
	const title = meta.title ?? null;
	const url = meta.url ?? (typeof location !== "undefined" ? location.href : null);
	const language = navigator && navigator.language ? navigator.language.split("-")[0] : "en";
	chrome.runtime.sendMessage({ type: "startJob" });

	const start = await fetch(`${serverAddress}/start`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ content: pageContent, title, url, language })
	});

	const { job_id } = await start.json();

	let done = false;
	while (!done) {
		const statusRes = await fetch(`${serverAddress}/status?id=${job_id}`);
		const status = await statusRes.json();
		if (status.status === "done") {
			highlightText(status.result);
			console.log("Wynik:", status.result);
			chrome.runtime.sendMessage({ type: "jobCompleted" });
			done = true;
		} else {
			console.log("Czekam...");
			await new Promise(r => setTimeout(r, 2000));
		}
	}
}

export { serverAddress };

export default {
	runJob,
	serverAddress
};
