import express from "express";
import mainRouter from "./routers/mainRouter.js";
import cors from "cors";

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

app.use(express.json());
app.use("/", mainRouter);

export default app;
