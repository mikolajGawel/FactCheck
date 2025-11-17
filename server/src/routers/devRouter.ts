import { Router } from "express";
import { isAIProcessing, requestRestartAfterProcessing } from "../services/analyzer.js";

const devRouter = Router();
devRouter.post("/restart", (req, res) => {
	try {
		if (isAIProcessing()) {
			requestRestartAfterProcessing();
			res.status(202).json({ status: "scheduled", message: "Restart scheduled when AI processing completes" });
			return;
		}

		res.json({ status: "ok", message: "Restarting now" });
		setTimeout(() => process.exit(0), 10); // allow the response to flush before exiting
	} catch (err) {
		console.error("Dev restart endpoint error:", err);
		res.status(500).json({ status: "error", message: "Failed to schedule restart" });
	}
});

export default devRouter;
