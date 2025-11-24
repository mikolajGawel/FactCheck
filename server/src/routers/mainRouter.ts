import express from "express";
import { getResult, getSenteceLimit, recvRequest, checkCache } from "../controllers/mainController.js";

const router = express.Router();

router.post("/start", recvRequest);
router.post("/cache/check", checkCache);
router.get("/status", getResult);
router.get("/limit", getSenteceLimit);

const mainRouter = router;
export default mainRouter;
