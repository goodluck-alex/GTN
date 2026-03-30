import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  createPayment,
  initiatePayment,
  confirmPayment,
  paymentWebhook,
  getPaymentStatus,
  getPaymentMethods,
  cryptoHealth,
  getPaymentTrace,
  getPaymentTraceAdmin,
} from "./paymentController.js";

const router = express.Router();

// Ops health checks
router.get("/health/crypto", cryptoHealth);
router.get("/trace/:id", getPaymentTraceAdmin);

// Stable contract (v1)
router.post("/", authenticate, createPayment);
router.post("/:id/initiate", authenticate, initiatePayment);
router.get("/:id/status", authenticate, getPaymentStatus);
router.get("/:id/trace", authenticate, getPaymentTrace);
router.post("/webhooks/:provider", paymentWebhook);
router.post("/:id/confirm", authenticate, confirmPayment);
router.get("/methods", getPaymentMethods);

// Explicit alias required by Phase 3 doc
router.get("/", getPaymentMethods);

// Legacy compatibility contract
router.post("/create", authenticate, createPayment);
router.post("/initiate", authenticate, initiatePayment);
router.post("/confirm/:id", authenticate, confirmPayment);
router.get("/status/:id", authenticate, getPaymentStatus);

// Provider callbacks (no auth; provider will call your public URL)
router.post("/webhook/:provider", paymentWebhook);

export default router;

