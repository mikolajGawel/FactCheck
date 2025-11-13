const jobs = {}; // jobs grouped by client IP

async function processContent(content) {
  // symulacja długiego przetwarzania
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    length: content.length,
  };
}

// ========== HANDLER: start ==========
export async function recvRequest(req, res) {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: "Brak danych 'content' w żądaniu" });
  }

  // identyfikacja IP
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  if (!jobs[ip]) jobs[ip] = {};

  const id = Date.now().toString();
  jobs[ip][id] = { status: "pending", result: null };

  res.json({ job_id: id });

  (async () => {
    try {
      const result = await processContent(content);
      jobs[ip][id] = { status: "done", result };
      console.log(`[JOB ${id}] zakończone dla IP ${ip}`);
    } catch (err) {
      jobs[ip][id] = { status: "error", result: err.message };
      console.error(`[JOB ${id}] błąd (${ip}):`, err);
    }
  })();
}

// ========== HANDLER: status ==========
export async function getResult(req, res) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "unknown";

  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Brak parametru 'id'" });

  const userJobs = jobs[ip];
  if (!userJobs) return res.status(404).json({ error: "Brak zadań dla tego IP" });

  const job = userJobs[id];
  if (!job) return res.status(403).json({ error: "Nie masz dostępu do tego zadania" });

  res.json({
    status: job.status,
    result: job.result,
    message: "Status zadania z serwera",
  });
}
