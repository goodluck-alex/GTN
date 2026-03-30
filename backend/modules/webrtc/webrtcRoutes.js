import express from "express";
import { getIceConfig } from "./webrtcController.js";

const router = express.Router();

/** No auth: STUN URLs are public. TURN credentials should be short-lived tokens — wire later. */
router.get("/ice-config", getIceConfig);

export default router;
