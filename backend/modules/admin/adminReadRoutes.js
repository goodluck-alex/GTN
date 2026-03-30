import express from "express";
import { authenticateAdmin } from "./adminAuthMiddleware.js";
import { requireSuperadmin } from "./adminRbacMiddleware.js";
import { listAdminUsers, getAdminUser } from "./adminUsersController.js";
import { listAdminPayments, getAdminPayment, getAdminPaymentTrace } from "./adminPaymentsController.js";
import {
  listPaymentCapabilities,
  patchPaymentCapability,
  createPaymentCapability,
} from "./adminPaymentCapabilitiesController.js";
import { listAdminPlans } from "./adminPlansController.js";
import { listAdminSubscriptions } from "./adminSubscriptionsController.js";
import { listAdminVoiceRooms } from "./adminVoiceRoomsController.js";
import { listAdminReferrals } from "./adminReferralsController.js";
import { listAdminAuditLogsHandler } from "./adminAuditLogsController.js";
import { getAdminOverview } from "./adminOverviewController.js";

const router = express.Router();
router.use(authenticateAdmin);

router.get("/overview", getAdminOverview);

router.get("/audit-logs", listAdminAuditLogsHandler);

router.get("/users", listAdminUsers);
router.get("/users/:id", getAdminUser);

router.get("/payments", listAdminPayments);
router.get("/payments/:id/trace", getAdminPaymentTrace);
router.get("/payments/:id", getAdminPayment);

router.get("/payment-capabilities", listPaymentCapabilities);
router.patch("/payment-capabilities/:id", requireSuperadmin, patchPaymentCapability);
router.post("/payment-capabilities", requireSuperadmin, createPaymentCapability);

router.get("/plans", listAdminPlans);

router.get("/subscriptions", listAdminSubscriptions);

router.get("/voice-rooms", listAdminVoiceRooms);

router.get("/referrals", listAdminReferrals);

export default router;
