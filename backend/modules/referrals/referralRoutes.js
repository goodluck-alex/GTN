import express from "express";
import { logReferralClick, triggerReferralBonus, getReferrals } from "./referralController.js";
import { authenticate } from "../../middleware/authMiddleware.js";
const router = express.Router();

router.post("/trigger", authenticate, triggerReferralBonus);
/** Click tracking (optional; no auth). */
router.post("/click", logReferralClick);
/** List referrals for the authenticated user (no id in URL — avoids mismatches). */
router.get("/", authenticate, getReferrals);

export default router;