import express from "express";
import { getResult, getSenteceLimit, recvRequest } from "../controllers/mainController.js";

const router = express.Router();

router.post("/start", recvRequest);
router.get("/status", getResult);
router.get("/limit", getSenteceLimit);

const mainRouter = router;
export default mainRouter;
