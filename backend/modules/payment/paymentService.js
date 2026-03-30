import { prisma } from "../../prisma/client.js";
import { activatePlan } from "../plans/plansService.js";
import { getPaymentAdapter } from "./providers/index.js";

function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function envBool(name, fallback = false) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function envNum(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

export const PAYMENT_STATUS = Object.freeze({
  created: "created",
  pending: "pending",
  succeeded: "succeeded",
  failed: "failed",
  expired: "expired",
  cancelled: "cancelled",
});

const RETRY_MAX_ATTEMPTS = Math.max(1, envNum("PAYMENT_RETRY_MAX_ATTEMPTS", 3));
const RETRY_BASE_MS = Math.max(50, envNum("PAYMENT_RETRY_BASE_MS", 250));
const TIMELINE_MAX_EVENTS = Math.max(10, envNum("PAYMENT_TIMELINE_MAX_EVENTS", 120));

const ALLOWED_TRANSITIONS = Object.freeze({
  created: new Set(["pending", "failed", "cancelled", "expired"]),
  pending: new Set(["succeeded", "failed", "cancelled", "expired"]),
  succeeded: new Set(),
  failed: new Set(),
  expired: new Set(),
  cancelled: new Set(),
});

const COUNTRY_DIALING = Object.freeze({
  UG: "256",
  KE: "254",
  TZ: "255",
  RW: "250",
  GH: "233",
  NG: "234",
  ZA: "27",
  US: "1",
  GB: "44",
});

async function tronGridPing({ walletAddress, baseUrl, apiKey }) {
  const cleanBase = String(baseUrl || "https://api.trongrid.io").replace(/\/+$/, "");
  const url = `${cleanBase}/v1/accounts/${encodeURIComponent(walletAddress)}/transactions/trc20?limit=1`;
  const headers = {};
  if (apiKey) headers["TRON-PRO-API-KEY"] = apiKey;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`TronGrid ping failed (${res.status})`);
  return true;
}

function normalizeProvider(input) {
  const p = String(input || "").trim().toUpperCase();
  if (p === "MTN" || p === "MTN_MOMO" || p === "MOMO") return "MTN";
  if (p === "AIRTEL" || p === "AIRTEL_MONEY") return "AIRTEL";
  if (p === "USDT_TRC20" || p === "USDT-TRC20" || p === "TRC20") return "USDT_TRC20";
  if (p === "GATEWAY" || p === "CARD_GATEWAY") return "GATEWAY";
  return p || "";
}

function normalizePaymentMethod(input) {
  const m = String(input || "").trim().toLowerCase();
  if (!m || m === "mobile_money" || m === "mobile-money" || m === "mobile") return "mobile_money";
  if (m === "crypto") return "crypto";
  if (m === "card") return "card";
  throw new Error("paymentMethod must be mobile_money, crypto, or card");
}

function normalizeCountry(input) {
  const c = String(input || "").trim().toUpperCase();
  if (!c) return "";
  if (!/^[A-Z]{2}$/.test(c)) throw new Error("country must be a 2-letter ISO code");
  return c;
}

function normalizePhone(input) {
  const raw = String(input || "").trim().replace(/\s/g, "");
  if (!raw) throw new Error("Phone number is required");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) throw new Error("Invalid phone number");
  return digits;
}

function normalizePhoneE164(input, countryIso) {
  const raw = String(input || "").trim().replace(/\s/g, "");
  if (!raw) throw new Error("Phone number is required");

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) throw new Error("Invalid phone number");
    return `+${digits}`;
  }

  const digits = normalizePhone(raw);
  if (raw.startsWith("00")) {
    const intl = raw.slice(2).replace(/\D/g, "");
    if (intl.length < 8 || intl.length > 15) throw new Error("Invalid phone number");
    return `+${intl}`;
  }

  const cc = COUNTRY_DIALING[countryIso] || "";
  if (!cc) {
    return `+${digits}`;
  }
  if (digits.startsWith(cc)) {
    return `+${digits}`;
  }
  if (digits.startsWith("0")) {
    return `+${cc}${digits.slice(1)}`;
  }
  return `+${cc}${digits}`;
}

function normalizeCurrency(input) {
  const c = String(input || "").trim().toUpperCase();
  if (!c) return process.env.PAYMENT_DEFAULT_CURRENCY || process.env.MTN_MOMO_CURRENCY || "UGX";
  // Support fiat ISO-4217 (3 letters) and common crypto tickers used by this system.
  // Example: USDT is 4 letters, but is the settlement unit for TRC20 payments.
  if (/^[A-Z]{3}$/.test(c)) return c;
  if (/^[A-Z0-9]{3,6}$/.test(c)) return c; // allow crypto tickers like USDT, BTC, ETH
  throw new Error("currency must be a 3-letter ISO code");
  return c;
}

function normalizeIdempotencyKey(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  if (s.length > 120) throw new Error("idempotencyKey is too long");
  return s;
}

function normalizeMetadata(input) {
  if (input == null) return null;
  if (typeof input !== "object" || Array.isArray(input)) throw new Error("metadata must be an object");
  return input;
}

function phoneCountryFromE164(e164) {
  const digits = String(e164 || "").replace(/^\+/, "");
  for (const [country, code] of Object.entries(COUNTRY_DIALING)) {
    if (digits.startsWith(code)) return country;
  }
  return "";
}

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientProviderError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return /timeout|timed out|econnreset|enotfound|network|temporar|429|502|503|504/.test(msg);
}

function toStructuredLog(level, event, extra = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    service: "payment",
    ...extra,
  };
  try {
    if (level === "error") console.error(JSON.stringify(payload));
    else if (level === "warn") console.warn(JSON.stringify(payload));
    else console.log(JSON.stringify(payload));
  } catch {
    // ignore structured log fallback errors
  }
}

async function appendTimeline(paymentId, stage, details = {}) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, select: { metadata: true } });
  if (!p) return;
  const timeline = Array.isArray(p.metadata?.timeline) ? p.metadata.timeline : [];
  timeline.push({
    at: new Date().toISOString(),
    stage,
    ...details,
  });
  const capped = timeline.slice(-TIMELINE_MAX_EVENTS);
  await prisma.payment.update({
    where: { id: paymentId },
    data: { metadata: { ...(p.metadata || {}), timeline: capped } },
  });
}

async function markDeadLetter(paymentId, operation, err) {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, select: { metadata: true } });
  if (!p) return;
  const dead = Array.isArray(p.metadata?.deadLetter) ? p.metadata.deadLetter : [];
  dead.push({
    at: new Date().toISOString(),
    operation,
    error: String(err?.message || err || "provider_error"),
  });
  await prisma.payment.update({
    where: { id: paymentId },
    data: { metadata: { ...(p.metadata || {}), deadLetter: dead.slice(-50) } },
  });
}

async function runProviderWithRetry({ payment, operation, fn }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt += 1) {
    try {
      if (payment?.id) await appendTimeline(payment.id, `${operation}_attempt`, { attempt });
      const out = await fn();
      if (payment?.id) await appendTimeline(payment.id, `${operation}_ok`, { attempt });
      return out;
    } catch (err) {
      lastErr = err;
      const transient = isTransientProviderError(err);
      if (payment?.id) {
        await appendTimeline(payment.id, `${operation}_error`, {
          attempt,
          transient,
          message: String(err?.message || err || ""),
        });
      }
      if (!transient || attempt >= RETRY_MAX_ATTEMPTS) break;
      const backoffMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await sleep(backoffMs);
    }
  }
  if (payment?.id) await markDeadLetter(payment.id, operation, lastErr);
  throw lastErr || new Error("Provider operation failed");
}

async function transitionStatus(paymentId, fromStatus, toStatus) {
  const allowed = ALLOWED_TRANSITIONS[fromStatus];
  if (!allowed?.has(toStatus)) {
    throw new Error(`Invalid payment status transition: ${fromStatus} -> ${toStatus}`);
  }
  const out = await prisma.payment.updateMany({
    where: { id: paymentId, status: fromStatus },
    data: { status: toStatus },
  });
  return out.count === 1;
}

/**
 * Support / ops: move payment to a policy-allowed next status (same graph as webhooks).
 */
export async function adminTransitionPaymentStatus(paymentId, toStatus) {
  const id = String(paymentId || "").trim();
  const target = String(toStatus || "").trim();
  if (!id) throw new Error("paymentId is required");
  if (!target) throw new Error("status is required");
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p) throw new Error("Payment not found");
  const moved = await transitionStatus(id, p.status, target);
  if (!moved) {
    const fresh = await prisma.payment.findUnique({ where: { id } });
    throw new Error(
      `Could not transition payment (current status: ${fresh?.status || "unknown"}; expected ${p.status} -> ${target})`
    );
  }
  return prisma.payment.findUnique({ where: { id } });
}

function toClientPayment(p) {
  return {
    ok: true,
    paymentId: p.id,
    planId: p.planId,
    amount: p.amount,
    currency: p.currency,
    paymentMethod: p.paymentMethod,
    provider: p.provider,
    gtnNumber: p.gtnNumber,
    phone: p.phone,
    status: p.status,
    idempotencyKey: p.idempotencyKey || null,
    reference: p.reference,
    providerTxnId: p.providerTxnId || null,
    metadata: p.metadata || null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function getPaymentOwnedByUser(userId, paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("paymentId is required");
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p || p.userId !== userId) throw new Error("Payment not found");
  return p;
}

function getAdapterOrThrow(method, provider) {
  const adapter = getPaymentAdapter(method, provider);
  if (!adapter) throw new Error(`No adapter for ${method}/${provider}`);
  return adapter;
}

const DEFAULT_CAPABILITIES = [
  // Mobile money starter matrix (extend as your provider contracts allow).
  { paymentMethod: "mobile_money", provider: "MTN", country: "UG", currency: "UGX", active: true },
  { paymentMethod: "mobile_money", provider: "AIRTEL", country: "UG", currency: "UGX", active: true },
  { paymentMethod: "mobile_money", provider: "AIRTEL", country: "KE", currency: "KES", active: true },
  { paymentMethod: "mobile_money", provider: "AIRTEL", country: "TZ", currency: "TZS", active: true },
  { paymentMethod: "mobile_money", provider: "AIRTEL", country: "RW", currency: "RWF", active: true },
  // Future methods (disabled by default until adapters are completed).
  { paymentMethod: "crypto", provider: "USDT_TRC20", country: "GLOBAL", currency: "USDT", active: false },
  { paymentMethod: "card", provider: "GATEWAY", country: "GLOBAL", currency: "USD", active: false },
];

async function ensureCapabilitiesSeeded() {
  if (!prisma?.paymentProviderCapability) {
    throw new Error(
      "PaymentProviderCapability is not available. Run: npx prisma generate (and apply migrations) in backend."
    );
  }
  const count = await prisma.paymentProviderCapability.count();
  if (count > 0) return;
  await prisma.paymentProviderCapability.createMany({
    data: DEFAULT_CAPABILITIES,
    skipDuplicates: true,
  });
}

async function resolveCapability({ method, provider, country, currency }) {
  await ensureCapabilitiesSeeded();
  const c = normalizeCountry(country);
  if (!c) throw new Error("country is required");

  const exact = await prisma.paymentProviderCapability.findFirst({
    where: {
      paymentMethod: method,
      provider,
      country: c,
      currency,
      active: true,
    },
  });
  if (exact) return exact;

  const global = await prisma.paymentProviderCapability.findFirst({
    where: {
      paymentMethod: method,
      provider,
      country: "GLOBAL",
      currency,
      active: true,
    },
  });
  if (global) return global;

  // Allow immediate crypto start when env is configured (even if DB row not enabled yet).
  if (
    method === "crypto" &&
    provider === "USDT_TRC20" &&
    currency === "USDT" &&
    (process.env.USDT_WALLET || process.env.USDT_TRC20_MASTER_ADDRESS)
  ) {
    return { paymentMethod: method, provider, country: "GLOBAL", currency, active: true };
  }

  // Card gateway is optional and feature-flagged.
  if (method === "card" && provider === "GATEWAY") {
    const enabled = envBool("CARD_GATEWAY_ENABLED", false);
    if (enabled) return { paymentMethod: method, provider, country: "GLOBAL", currency, active: true };
  }

  throw new Error(`Provider '${provider}' is not enabled for ${c}/${currency}`);
}

export async function createPayment({
  userId,
  planId,
  paymentMethod = "mobile_money",
  provider,
  phone,
  currency,
  idempotencyKey,
  metadata,
  country,
}) {
  const pid = String(planId || "").trim();
  if (!pid) throw new Error("planId is required");

  const method = normalizePaymentMethod(paymentMethod);
  const prov = normalizeProvider(provider);
  if (!prov) throw new Error("provider is required");
  getAdapterOrThrow(method, prov);

  const cur = normalizeCurrency(currency);
  const countryIso = normalizeCountry(country) || normalizeCountry(metadata?.country);
  const idem = normalizeIdempotencyKey(idempotencyKey);
  const meta = normalizeMetadata(metadata);

  const mergedMeta = {
    ...(meta || {}),
    country: countryIso || meta?.country || null,
  };
  const effectiveCountry = normalizeCountry(mergedMeta.country);
  if (!effectiveCountry) throw new Error("country is required");

  const cleanPhone = method === "mobile_money" ? normalizePhoneE164(phone, effectiveCountry) : null;
  const inferredCountry = cleanPhone ? phoneCountryFromE164(cleanPhone) : "";
  const capabilityCountry = effectiveCountry || inferredCountry;
  await resolveCapability({
    method,
    provider: prov,
    country: capabilityCountry,
    currency: cur,
  });

  if (idem) {
    const existing = await prisma.payment.findFirst({ where: { userId, idempotencyKey: idem } });
    if (existing) {
      return { ...toClientPayment(existing), reused: true, message: "Idempotent replay: returning existing payment." };
    }
  }

  const [plan, user] = await Promise.all([
    prisma.plan.findUnique({ where: { id: pid } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!plan || !plan.active) throw new Error("Invalid plan");
  if (pid === "free") throw new Error("Free plan does not require payment");

  // Basic anti-fraud guards (velocity + amount sanity).
  const perMinMax = Math.max(1, envNum("PAYMENT_ANTIFRAUD_CREATE_PER_MIN", 10));
  const minAmount = Math.max(0, envNum("PAYMENT_MIN_AMOUNT", 0.01));
  const maxAmount = Math.max(minAmount, envNum("PAYMENT_MAX_AMOUNT", 5000));
  if (plan.price < minAmount || plan.price > maxAmount) {
    throw new Error(`amount out of allowed range (${minAmount}-${maxAmount})`);
  }
  const since = new Date(Date.now() - 60_000);
  const recentCreates = await prisma.payment.count({
    where: { userId, createdAt: { gte: since } },
  });
  if (recentCreates >= perMinMax) {
    throw new Error("Too many payment attempts. Please wait and try again.");
  }

  const payment = await prisma.payment.create({
    data: {
      userId,
      planId: pid,
      amount: plan.price,
      currency: cur,
      paymentMethod: method,
      provider: prov,
      gtnNumber: user?.phone || (user?.subscriberId ? `+256${user.subscriberId}` : null),
      phone: cleanPhone,
      status: PAYMENT_STATUS.created,
      idempotencyKey: idem,
      reference: uuid(),
      metadata: {
        ...mergedMeta,
        country: capabilityCountry,
      },
    },
  });

  await appendTimeline(payment.id, "created", {
    method,
    provider: prov,
    amount: plan.price,
    currency: cur,
    country: capabilityCountry,
  });
  toStructuredLog("info", "payment_created", { paymentId: payment.id, userId, method, provider: prov });

  return { ...toClientPayment(payment), message: "Payment created." };
}

export async function processPayment(methodOrArgs, providerArg, payloadArg) {
  const args =
    methodOrArgs && typeof methodOrArgs === "object"
      ? methodOrArgs
      : {
          ...(payloadArg || {}),
          paymentMethod: methodOrArgs,
          provider: providerArg,
        };

  const {
    userId,
    paymentId,
    planId,
    paymentMethod = "mobile_money",
    provider,
    phone,
    currency,
    idempotencyKey,
    metadata,
    country,
  } = args;
  let payment;
  if (paymentId) {
    payment = await getPaymentOwnedByUser(userId, paymentId);
  } else {
    const created = await createPayment({
      userId,
      planId,
      paymentMethod,
      provider,
      phone,
      currency,
      idempotencyKey,
      metadata,
      country,
    });
    payment = await prisma.payment.findUnique({ where: { id: created.paymentId } });
  }

  if (!payment) throw new Error("Payment not found");
  const adapter = getAdapterOrThrow(payment.paymentMethod, payment.provider);

  if (payment.status === PAYMENT_STATUS.pending) {
    return { ...toClientPayment(payment), message: "Payment is already pending." };
  }
  if (payment.status !== PAYMENT_STATUS.created) {
    return { ...toClientPayment(payment), message: `Payment is already ${payment.status}.` };
  }

  const plan = await prisma.plan.findUnique({ where: { id: payment.planId } });
  if (!plan || !plan.active) throw new Error("Invalid plan");

  try {
    const out = await runProviderWithRetry({
      payment,
      operation: "provider_process",
      fn: () => adapter.process({ payment, plan, payload: metadata || null }),
    });
    if (out?.crypto && typeof out.crypto === "object") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          metadata: {
            ...(payment.metadata || {}),
            crypto: out.crypto,
          },
        },
      });
    }
    if (out?.checkoutUrl && typeof out.checkoutUrl === "string") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          metadata: {
            ...(payment.metadata || {}),
            checkoutUrl: String(out.checkoutUrl),
            checkoutMode: out?.mode ? String(out.mode) : "hosted_checkout",
          },
        },
      });
    }
    if (out?.providerTxnId) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { providerTxnId: String(out.providerTxnId) },
      });
    }
  } catch (err) {
    await transitionStatus(payment.id, PAYMENT_STATUS.created, PAYMENT_STATUS.failed).catch(() => {});
    await appendTimeline(payment.id, "failed", { reason: String(err?.message || "provider_process_failed") }).catch(() => {});
    toStructuredLog("error", "payment_process_failed", {
      paymentId: payment.id,
      userId: payment.userId,
      provider: payment.provider,
      message: String(err?.message || err || ""),
    });
    throw err;
  }

  const moved = await transitionStatus(payment.id, PAYMENT_STATUS.created, PAYMENT_STATUS.pending);
  const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
  if (!moved && fresh?.status !== PAYMENT_STATUS.pending) {
    throw new Error("Could not move payment to pending");
  }
  await appendTimeline(payment.id, "pending", { source: "initiate" }).catch(() => {});
  return {
    ...toClientPayment(fresh),
    checkoutUrl: fresh?.metadata?.checkoutUrl || null,
    message:
      fresh?.paymentMethod === "card"
        ? "Checkout ready. Continue in browser."
        : fresh?.paymentMethod === "crypto"
          ? "Payment created. Send USDT, then confirm."
          : "Payment initiated. Check your phone and approve.",
  };
}

export async function initiatePayment(args) {
  return processPayment(args);
}

export async function getPaymentStatus(userId, paymentId) {
  const p = await getPaymentOwnedByUser(userId, paymentId);
  if (p.status === PAYMENT_STATUS.pending) {
    const adapter = getAdapterOrThrow(p.paymentMethod, p.provider);
    try {
      const st = await runProviderWithRetry({
        payment: p,
        operation: "provider_check_status",
        fn: () => adapter.checkStatus({ payment: p }),
      });
      if (st?.status === PAYMENT_STATUS.succeeded) {
        const moved = await transitionStatus(p.id, PAYMENT_STATUS.pending, PAYMENT_STATUS.succeeded);
        if (moved) {
          await appendTimeline(p.id, "succeeded", { source: "poll_status" }).catch(() => {});
          await activatePlan(p.userId, p.planId, { paymentId: p.id, metadata: { source: "poll_status" } });
        }
      } else if (st?.status === PAYMENT_STATUS.failed) {
        await transitionStatus(p.id, PAYMENT_STATUS.pending, PAYMENT_STATUS.failed).catch(() => {});
        await appendTimeline(p.id, "failed", { source: "poll_status" }).catch(() => {});
      } else if (st?.status === PAYMENT_STATUS.cancelled) {
        await transitionStatus(p.id, PAYMENT_STATUS.pending, PAYMENT_STATUS.cancelled).catch(() => {});
        await appendTimeline(p.id, "cancelled", { source: "poll_status" }).catch(() => {});
      } else if (st?.status === PAYMENT_STATUS.expired) {
        await transitionStatus(p.id, PAYMENT_STATUS.pending, PAYMENT_STATUS.expired).catch(() => {});
        await appendTimeline(p.id, "expired", { source: "poll_status" }).catch(() => {});
      }
    } catch {
      // provider status check failures are non-fatal for polling
    }
  }
  const fresh = await prisma.payment.findUnique({ where: { id: p.id } });
  return toClientPayment(fresh);
}

export async function confirmPayment(userId, paymentId, payload = {}) {
  const p = await getPaymentOwnedByUser(userId, paymentId);
  const adapter = getAdapterOrThrow(p.paymentMethod, p.provider);
  if (!adapter.confirm) throw new Error(`No confirm flow for ${p.paymentMethod}/${p.provider}`);

  const out = await runProviderWithRetry({
    payment: p,
    operation: "provider_confirm",
    fn: () => adapter.confirm({ payment: p, payload }),
  });
  const next = String(out?.status || "").toLowerCase();
  if (!next || next === PAYMENT_STATUS.pending) {
    const freshPending = await prisma.payment.findUnique({ where: { id: p.id } });
    return { ...toClientPayment(freshPending), message: "Payment confirmation submitted and still pending." };
  }

  if (next === PAYMENT_STATUS.succeeded) {
    if (out?.providerTxnId) {
      const existing = await prisma.payment.findFirst({
        where: {
          provider: p.provider,
          providerTxnId: String(out.providerTxnId),
          NOT: { id: p.id },
        },
      });
      if (existing) {
        throw new Error("This crypto transaction was already used for another payment.");
      }
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          providerTxnId: String(out.providerTxnId),
          metadata: {
            ...(p.metadata || {}),
            cryptoMatch: {
              providerTxnId: String(out.providerTxnId),
              raw: out?.raw || null,
              matchedAt: new Date().toISOString(),
            },
          },
        },
      });
    }
    const moved = await transitionStatus(p.id, p.status, PAYMENT_STATUS.succeeded).catch(() => false);
    if (moved) {
      await appendTimeline(p.id, "succeeded", { source: "confirm" }).catch(() => {});
      await activatePlan(p.userId, p.planId, { paymentId: p.id, metadata: { source: "confirm" } });
    }
  } else if (next === PAYMENT_STATUS.failed || next === PAYMENT_STATUS.cancelled || next === PAYMENT_STATUS.expired) {
    await transitionStatus(p.id, p.status, next).catch(() => {});
    await appendTimeline(p.id, next, { source: "confirm" }).catch(() => {});
  }

  const fresh = await prisma.payment.findUnique({ where: { id: p.id } });
  return { ...toClientPayment(fresh), message: `Payment is ${fresh.status}.` };
}

export async function handleWebhook(provider, payload) {
  const prov = normalizeProvider(provider);
  if (!prov) throw new Error("Unknown provider");

  const statusRaw = String(payload?.status || "").toLowerCase();
  const nextStatus =
    statusRaw === "succeeded" || statusRaw === "success"
      ? PAYMENT_STATUS.succeeded
      : statusRaw === "failed"
        ? PAYMENT_STATUS.failed
        : "";
  if (!nextStatus) throw new Error("Invalid status");

  const ref = payload?.reference ? String(payload.reference).trim() : "";
  const pid = payload?.paymentId ? String(payload.paymentId).trim() : "";
  if (!ref && !pid) throw new Error("reference or paymentId is required");

  const payment = ref
    ? await prisma.payment.findFirst({ where: { reference: ref, provider: prov } })
    : await prisma.payment.findUnique({ where: { id: pid } });
  if (!payment) throw new Error("Payment not found");
  await appendTimeline(payment.id, "webhook_received", { provider: prov, status: nextStatus }).catch(() => {});

  if (payment.status !== PAYMENT_STATUS.pending) {
    return { paymentId: payment.id, status: payment.status, message: "Already processed" };
  }

  const moved = await transitionStatus(payment.id, PAYMENT_STATUS.pending, nextStatus);
  if (!moved) {
    const latest = await prisma.payment.findUnique({ where: { id: payment.id } });
    return { paymentId: payment.id, status: latest?.status || payment.status, message: "Already processed" };
  }

  if (nextStatus === PAYMENT_STATUS.succeeded) {
    await appendTimeline(payment.id, "succeeded", { source: "webhook", provider: prov }).catch(() => {});
    const activation = await activatePlan(payment.userId, payment.planId, {
      paymentId: payment.id,
      metadata: { source: "webhook", provider: prov },
    });
    return { paymentId: payment.id, status: PAYMENT_STATUS.succeeded, activated: true, activation };
  }
  await appendTimeline(payment.id, "failed", { source: "webhook", provider: prov }).catch(() => {});
  return { paymentId: payment.id, status: PAYMENT_STATUS.failed, activated: false };
}

export async function getPaymentTrace(userId, paymentId) {
  const p = await getPaymentOwnedByUser(userId, paymentId);
  const timeline = Array.isArray(p?.metadata?.timeline) ? p.metadata.timeline : [];
  const deadLetter = Array.isArray(p?.metadata?.deadLetter) ? p.metadata.deadLetter : [];
  return {
    ok: true,
    payment: toClientPayment(p),
    trace: {
      timeline,
      deadLetter,
    },
  };
}

/**
 * Load payment + timeline/deadLetter for ops (no auth — callers must enforce access).
 */
export async function getPaymentTraceById(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) throw new Error("paymentId is required");
  const p = await prisma.payment.findUnique({ where: { id } });
  if (!p) throw new Error("Payment not found");
  const timeline = Array.isArray(p?.metadata?.timeline) ? p.metadata.timeline : [];
  const deadLetter = Array.isArray(p?.metadata?.deadLetter) ? p.metadata.deadLetter : [];
  return {
    ok: true,
    payment: toClientPayment(p),
    trace: {
      timeline,
      deadLetter,
    },
  };
}

export async function getPaymentTraceAdmin(paymentId, adminToken) {
  const required = env("PAYMENT_ADMIN_TRACE_TOKEN", "");
  if (!required) throw new Error("Admin trace is not configured");
  if (!adminToken || String(adminToken).trim() !== required) throw new Error("Unauthorized admin trace access");
  return getPaymentTraceById(paymentId);
}

export async function cryptoHealthCheck() {
  const walletAddress = env("USDT_WALLET", "") || env("USDT_TRC20_MASTER_ADDRESS", "");
  const baseUrl = env("TRONGRID_BASE_URL", "https://api.trongrid.io");
  const hasWallet = Boolean(walletAddress);
  if (!hasWallet) {
    return {
      walletConfigured: false,
      tronGridReachable: false,
      tronGridBaseUrl: baseUrl,
      message: "Missing USDT_WALLET in environment.",
    };
  }

  try {
    await tronGridPing({
      walletAddress,
      baseUrl,
      apiKey: env("TRONGRID_API_KEY", ""),
    });
    return {
      walletConfigured: true,
      tronGridReachable: true,
      tronGridBaseUrl: baseUrl,
      wallet: walletAddress,
    };
  } catch (e) {
    return {
      walletConfigured: true,
      tronGridReachable: false,
      tronGridBaseUrl: baseUrl,
      wallet: walletAddress,
      message: e?.message || "TronGrid unreachable",
    };
  }
}

export function getPaymentMethods({ country, currency } = {}) {
  // Backward compatibility alias: keep name while returning async Promise.
  return getPaymentMethodsAsync({ country, currency });
}

export async function getPaymentMethodsAsync({ country, currency } = {}) {
  await ensureCapabilitiesSeeded();
  const c = normalizeCountry(country);
  const currencyRaw = String(currency || "").trim();
  const cur = currencyRaw ? normalizeCurrency(currencyRaw) : null;

  const rows = await prisma.paymentProviderCapability.findMany({
    where: {
      active: true,
      ...(c ? { OR: [{ country: c }, { country: "GLOBAL" }] } : {}),
      ...(cur ? { currency: cur } : {}),
    },
    orderBy: [{ paymentMethod: "asc" }, { provider: "asc" }],
  });

  const cardEnabled = envBool("CARD_GATEWAY_ENABLED", false);
  const cryptoEnabled = Boolean(env("USDT_WALLET", "") || env("USDT_TRC20_MASTER_ADDRESS", ""));

  const methodsMap = new Map();
  for (const row of rows) {
    if (row.paymentMethod === "card" && row.provider === "GATEWAY" && !cardEnabled) continue;
    const key = row.paymentMethod;
    if (!methodsMap.has(key)) methodsMap.set(key, []);
    methodsMap.get(key).push({
      id: row.provider,
      enabled: true,
      country: row.country,
      currency: row.currency,
      metadata: row.metadata || null,
    });
  }

  // Synthetic capabilities for method-agnostic UX:
  // - show crypto when wallet env is configured (even if DB capability is off)
  // - show card when feature flag is enabled (even if DB capability is off)
  if (cryptoEnabled) {
    if (!methodsMap.has("crypto")) methodsMap.set("crypto", []);
    if (!methodsMap.get("crypto").some((p) => String(p.id).toUpperCase() === "USDT_TRC20")) {
      methodsMap.get("crypto").push({
        id: "USDT_TRC20",
        enabled: true,
        country: "GLOBAL",
        currency: "USDT",
        metadata: { mode: "manual_confirm" },
      });
    }
  }
  if (cardEnabled) {
    if (!methodsMap.has("card")) methodsMap.set("card", []);
    if (!methodsMap.get("card").some((p) => String(p.id).toUpperCase() === "GATEWAY")) {
      methodsMap.get("card").push({
        id: "GATEWAY",
        enabled: true,
        country: "GLOBAL",
        currency: "USD",
        metadata: { mode: "hosted_checkout" },
      });
    }
  }

  return {
    ok: true,
    country: c || null,
    currency: cur,
    methods: Array.from(methodsMap.entries()).map(([method, providers]) => ({ method, providers })),
  };
}

