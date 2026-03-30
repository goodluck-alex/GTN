import express from "express";
import { authenticateAdmin } from "./adminAuthMiddleware.js";
import { requireSuperadmin } from "./adminRbacMiddleware.js";
import { patchAdminUser } from "./adminUsersController.js";
import { createAdminPlan, patchAdminPlan } from "./adminPlansController.js";
import { patchAdminPayment } from "./adminPaymentsController.js";
import { patchAdminReferral, postAdminReferralCompleteReward } from "./adminReferralsAdminController.js";
import { postAdminVoiceRoomEnd } from "./adminVoiceRoomsAdminController.js";

const router = express.Router();
router.use(authenticateAdmin);

router.patch("/users/:id", patchAdminUser);

router.post("/plans", requireSuperadmin, createAdminPlan);
router.patch("/plans/:id", requireSuperadmin, patchAdminPlan);

router.patch("/payments/:id", patchAdminPayment);

router.patch("/referrals/:id", patchAdminReferral);
router.post("/referrals/:id/complete-reward", postAdminReferralCompleteReward);

router.post("/voice-rooms/:id/end", postAdminVoiceRoomEnd);

export default router;
