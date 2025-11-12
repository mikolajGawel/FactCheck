const jobs = {};

async function processContent(content) {
  // test długiego oczekiwania jak przy prompcie
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    length: content.length,
  };
}

export async function recvRequest(req,res){
  const {content} = req.body;

  if (!content) {
    return res.status(400).json({ error: "Brak danych 'content' w żądaniu" });
  }

  const id = Date.now().toString();
  jobs[id] = { status: "pending", result: null };
  res.json({ job_id: id });
  
   (async () => {
    try {
      const result = await processContent(content);
      jobs[id] = { status: "done", result };
      console.log(`[JOB ${id}] zakończone`);
    } catch (err) {
      jobs[id] = { status: "error", result: err.message };
      console.error(`[JOB ${id}] błąd:`, err);
    }
  })();
}
export async function getResult(req,res){
    const job = jobs[req.query.id];
    if (!job) return res.status(404).json({ error: "Brak zadania" });
    res.json({
      status:job.status,
      result:job.result,
      message:"Przesył danych z serwera"}
    );
}
