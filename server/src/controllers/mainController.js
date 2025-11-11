const jobs = {};

export async function recvRequest(req,res){
    const id = Date.now().toString();
    jobs[id] = { status: "pending", result: null };
    
    // symulacja długiego procesu
    setTimeout(() => {
      jobs[id] = { status: "done", result: "Oto wynik" };
    }, 10000);
    
    res.json({ job_id: id });
}
export async function getResult(req,res){
    const job = jobs[req.query.id];
    if (!job) return res.status(404).json({ error: "Brak zadania" });
    res.json({status:job.status,result:job.result,message:"Przesył danych z serwera"});
}
