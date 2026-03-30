import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import { getPlansAndMe, activatePlan } from "./plansController.js";

const router = express.Router();

router.get("/", authenticate, getPlansAndMe);
router.post("/activate", authenticate, activatePlan);

export default router;

