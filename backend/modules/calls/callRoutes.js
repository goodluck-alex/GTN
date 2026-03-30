import express from "express";
import { startCall, endCall, getCalls, canStartCall } from "./callController.js";
import { authenticate } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.get("/can-start", authenticate, canStartCall);
router.post("/start", authenticate, startCall);
router.post("/end", authenticate, endCall);

// Existing: list calls for authenticated user
router.get("/", authenticate, getCalls);

// Frontend-compatible: alias for history with userId path
router.get("/history/:userId", authenticate, getCalls);

// Frontend-compatible: history without params
router.get("/history", authenticate, getCalls);

export default router;