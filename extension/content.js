import { serverAddress } from "./config";
(() => {
  

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


  runJob();


})();
