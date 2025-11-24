import express from "express";
import mainRouter from "./routers/mainRouter.js";
import cors from "cors";
import devRouter from "./routers/devRouter.js";

import logsRouter from "./routers/logsRouter.js";

const app = express();

app.use(
	cors({
		origin: "*",
		methods: ["GET", "POST", "OPTIONS"],
		allowedHeaders: ["Content-Type"],
		exposedHeaders: ["Access-Control-Allow-Private-Network"]
	})
);

app.use((req, res, next) => {
	if (req.method === "OPTIONS") {
		return res.sendStatus(200);
	}

	next();
});

app.use(express.json({ limit: "5mb" }));
app.use("/api/logs", logsRouter);
app.use("/", mainRouter);

// Development-only endpoints to allow an external watcher to request a restart.
if (process.env.NODE_ENV !== "production") {
	app.use("/__dev", devRouter);
}

export default app;
