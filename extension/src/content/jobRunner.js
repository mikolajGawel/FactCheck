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
    
    // USUNIĘTO: chrome.runtime.sendMessage({ type: "startJob" });
    // Stan '1: progress' jest teraz ustawiany przez popup.js przed wywołaniem runJob.
    // Dzięki temu mamy pewność, że stan jest poprawnie ustawiony w background.js.

    const start = await fetch(`${serverAddress}/start`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content: pageContent, title, url, language })
    });

    // Dodaj obsługę błędu serwera
    if (!start.ok) {
        const errorText = await start.text();
        console.error("Server start failed:", errorText);
        // Powiadom o błędzie
        chrome.runtime.sendMessage({ type: "jobFailed", error: `Server failed to start job: ${start.status}` });
        return; // Zakończ funkcję, jeśli start się nie powiedzie
    }

    const { job_id } = await start.json();

    let done = false;
    let jobError = null; // Zmienna do przechwytywania błędów zadania

    while (!done) {
        const statusRes = await fetch(`${serverAddress}/status?id=${job_id}`);
        
        if (!statusRes.ok) {
             jobError = `Status check failed with status ${statusRes.status}.`;
             done = true; // Wychodzimy z pętli w przypadku błędu sieci
             break;
        }

        const status = await statusRes.json();
        
        if (status.status === "done") {
            highlightText(status.result);
            console.log("Wynik:", status.result);
            chrome.runtime.sendMessage({ type: "jobCompleted" });
            done = true;
        } else if (status.status === "failed" || status.status === "error") {
            jobError = status.message || "Job failed on the server.";
            done = true;
        } else {
            console.log("Czekam...");
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    
    if (jobError) {
        // Jeśli wystąpił błąd w pętli, powiadom background.js
        chrome.runtime.sendMessage({ type: "jobFailed", error: jobError });
    }
}

export { serverAddress };

export default {
    runJob,
    serverAddress
};