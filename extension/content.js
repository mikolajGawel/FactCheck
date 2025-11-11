
(() => {
  const serverAddress = "http://localhost:3000" 
  
  async function runJob() {
    const start = await fetch(`${serverAddress}/start`, { method: "POST" });
    const { job_id } = await start.json();
  
    let done = false;
    while (!done) {
      const statusRes = await fetch( `${serverAddress}/status?id=${job_id}`);
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

  // const pageContent = document.documentElement.innerText.trim();
  // console.log("🔍 Page content copied:");
  // console.log(pageContent);
  runJob();


})();
