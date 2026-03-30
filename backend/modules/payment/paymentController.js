import * as paymentService from "./paymentService.js";
import crypto from "crypto";

function readIdempotencyKey(req) {
  return req.headers["idempotency-key"] || req.body?.idempotencyKey || null;
}

function toErrorPayload(err, fallbackCode) {
  const message = err?.message || "Request failed";
  let code = fallbackCode;
  let status = 400;

  if (/not found/i.test(message)) {
    code = "NOT_FOUND";
    status = 404;
  } else if (/rate limit|too many/i.test(message)) {
    code = "RATE_LIMITED";
    status = 429;
  } else if (/signature/i.test(message)) {
    code = "WEBHOOK_SIGNATURE_INVALID";
    status = 401;
  } else if (/missing|required|invalid|must be|unsupported|too long/i.test(message)) {
    code = "VALIDATION_ERROR";
    status = 400;
  } else if (/not configured|token failed|requesttopay failed|initiate failed|status failed/i.test(message)) {
    code = "PROVIDER_ERROR";
    status = 502;
  } else if (/already/i.test(message)) {
    code = "CONFLICT";
    status = 409;
  }

  return {
    status,
    body: {
      ok: false,
      error: message,
      code,
      details: { code, message },
    },
  };
}

function sendSuccess(res, data, status = 200) {
  // Keep stable envelope while preserving top-level fields for existing clients.
  res.status(status).json({
    ok: true,
    data,
    ...(data && typeof data === "object" ? data : {}),
  });
}

function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

const rateBuckets = new Map();
function enforceRateLimit(req, keyPrefix, { windowMs, max }) {
  const now = Date.now();
  const key = `${keyPrefix}:${req.user?.id || "anon"}:${getClientIp(req)}`;
  const hit = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > hit.resetAt) {
    hit.count = 0;
    hit.resetAt = now + windowMs;
  }
  hit.count += 1;
  rateBuckets.set(key, hit);
  if (hit.count > max) {
    const retrySecs = Math.max(1, Math.ceil((hit.resetAt - now) / 1000));
    const err = new Error(`Rate limit exceeded. Retry in ${retrySecs}s`);
    err.code = "RATE_LIMITED";
    throw err;
  }
}

function signatureSecretForProvider(provider) {
  const p = String(provider || "").trim().toUpperCase();
  return (
    env(`PAYMENT_WEBHOOK_SECRET_${p}`, "") ||
    env("PAYMENT_WEBHOOK_SECRET", "")
  );
}

function extractSignature(req) {
  return String(
    req.headers["x-signature"] ||
      req.headers["x-webhook-signature"] ||
      req.headers["x-provider-signature"] ||
      ""
  ).trim();
}

function verifyWebhookSignature(req, provider) {
  const secret = signatureSecretForProvider(provider);
  if (!secret) return true; // not enforced when no secret configured
  const sig = extractSignature(req);
  if (!sig) throw new Error("Missing webhook signature");
  const body = JSON.stringify(req.body || {});
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function createPayment(req, res) {
  try {
    enforceRateLimit(req, "create_payment", { windowMs: 60_000, max: Number(process.env.PAYMENT_RATE_CREATE_PER_MIN || 12) });
    const out = await paymentService.createPayment({
      userId: req.user.id,
      planId: req.body?.planId,
      paymentMethod: req.body?.paymentMethod,
      provider: req.body?.provider,
      phone: req.body?.phone,
      country: req.body?.country,
      currency: req.body?.currency,
      metadata: req.body?.metadata,
      idempotencyKey: readIdempotencyKey(req),
    });
    sendSuccess(res, out, 201);
  } catch (err) {
    const e = toErrorPayload(err, "payment_create_failed");
    res.status(e.status).json(e.body);
  }
}

export async function initiatePayment(req, res) {
  try {
    enforceRateLimit(req, "initiate_payment", { windowMs: 60_000, max: Number(process.env.PAYMENT_RATE_INITIATE_PER_MIN || 15) });
    const out = await paymentService.processPayment({
      userId: req.user.id,
      paymentId: req.params?.id || req.body?.paymentId,
      planId: req.body?.planId,
      paymentMethod: req.body?.paymentMethod,
      provider: req.body?.provider,
      phone: req.body?.phone,
      country: req.body?.country,
      currency: req.body?.currency,
      metadata: req.body?.metadata,
      idempotencyKey: readIdempotencyKey(req),
    });
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "payment_initiate_failed");
    res.status(e.status).json(e.body);
  }
}

export async function getPaymentMethods(req, res) {
  try {
    const out = await paymentService.getPaymentMethodsAsync({
      country: req.query?.country,
      currency: req.query?.currency,
    });
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "payment_methods_failed");
    res.status(e.status).json(e.body);
  }
}

export async function confirmPayment(req, res) {
  try {
    enforceRateLimit(req, "confirm_payment", { windowMs: 60_000, max: Number(process.env.PAYMENT_RATE_CONFIRM_PER_MIN || 30) });
    const out = await paymentService.confirmPayment(req.user.id, req.params.id, req.body || {});
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "payment_confirm_failed");
    res.status(e.status).json(e.body);
  }
}

export async function getPaymentStatus(req, res) {
  try {
    const out = await paymentService.getPaymentStatus(req.user.id, req.params.id);
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "payment_status_failed");
    res.status(e.status).json(e.body);
  }
}

export async function paymentWebhook(req, res) {
  try {
    const provider = req.params.provider;
    if (!verifyWebhookSignature(req, provider)) {
      return res.status(401).json({
        ok: false,
        error: "Invalid webhook signature",
        code: "WEBHOOK_SIGNATURE_INVALID",
      });
    }
    const out = await paymentService.handleWebhook(provider, req.body);
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "webhook_failed");
    res.status(e.status).json(e.body);
  }
}

export async function cryptoHealth(req, res) {
  try {
    const out = await paymentService.cryptoHealthCheck();
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "crypto_health_failed");
    res.status(e.status).json(e.body);
  }
}

export async function getPaymentTrace(req, res) {
  try {
    const out = await paymentService.getPaymentTrace(req.user.id, req.params.id);
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "payment_trace_failed");
    res.status(e.status).json(e.body);
  }
}

export async function getPaymentTraceAdmin(req, res) {
  try {
    const token = String(req.headers["x-admin-trace-token"] || "").trim();
    const out = await paymentService.getPaymentTraceAdmin(req.params.id, token);
    sendSuccess(res, out);
  } catch (err) {
    const e = toErrorPayload(err, "payment_admin_trace_failed");
    const status = /unauthorized/i.test(String(err?.message || "")) ? 401 : e.status;
    res.status(status).json({ ...(e.body || {}), code: status === 401 ? "UNAUTHORIZED" : e.body?.code });
  }
}

