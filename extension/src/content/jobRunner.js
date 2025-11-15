const serverAddress = process.env.SERVER;

/**
 * @async
 * @param {string} [textContent] Optional text content to process. When omitted, the entire page text is used.
 * @returns {Promise<void>} Resolves when the server reports the job is complete. Does not return job result (it logs it).
 */
export async function runJob(textContent) {
	const pageContent = typeof textContent === "string" ? textContent : document.documentElement.innerText.trim();

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

export { serverAddress };

export default {
	runJob,
	serverAddress
};
