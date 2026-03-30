function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function baseUrl() {
  // MTN MoMo developer: sandbox vs production
  // sandbox: https://sandbox.momodeveloper.mtn.com
  // production often uses https://momodeveloper.mtn.com (region-specific); we'll configure via env
  return env("MTN_MOMO_BASE_URL", "https://sandbox.momodeveloper.mtn.com").replace(/\/+$/, "");
}

function targetEnvironment() {
  // sandbox | mtnug | mtniv ... (for live it's region-specific)
  return env("MTN_MOMO_TARGET_ENV", "sandbox");
}

function subscriptionKey() {
  return env("MTN_MOMO_SUBSCRIPTION_KEY", "");
}

function apiUser() {
  return env("MTN_MOMO_API_USER", "");
}

function apiKey() {
  return env("MTN_MOMO_API_KEY", "");
}

function callbackUrl() {
  return env("MTN_MOMO_CALLBACK_URL", "");
}

function asBasic(user, key) {
  const raw = `${user}:${key}`;
  return Buffer.from(raw, "utf8").toString("base64");
}

let cachedToken = null;
let cachedTokenExpMs = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && cachedTokenExpMs - 60_000 > now) return cachedToken;

  const subKey = subscriptionKey();
  const u = apiUser();
  const k = apiKey();
  if (!subKey || !u || !k) {
    throw new Error("MTN MoMo is not configured (missing subscription key / api user / api key)");
  }

  const res = await fetch(`${baseUrl()}/collection/token/`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${asBasic(u, k)}`,
      "Ocp-Apim-Subscription-Key": subKey,
      "X-Target-Environment": targetEnvironment(),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `MTN token failed (${res.status})`);
  }
  const token = data?.access_token;
  const expiresIn = Number(data?.expires_in || 3600);
  if (!token) throw new Error("MTN token missing access_token");
  cachedToken = token;
  cachedTokenExpMs = now + expiresIn * 1000;
  return token;
}

export async function requestToPay({ referenceId, amount, currency, payerMsisdn, payerMessage, payeeNote, externalId }) {
  const token = await getAccessToken();
  const subKey = subscriptionKey();
  const cb = callbackUrl();

  const headers = {
    Authorization: `Bearer ${token}`,
    "Ocp-Apim-Subscription-Key": subKey,
    "X-Target-Environment": targetEnvironment(),
    "X-Reference-Id": referenceId,
    "Content-Type": "application/json",
  };
  if (cb) headers["X-Callback-Url"] = cb;

  const res = await fetch(`${baseUrl()}/collection/v1_0/requesttopay`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      amount: String(amount),
      currency: String(currency),
      externalId: String(externalId || referenceId),
      payer: { partyIdType: "MSISDN", partyId: String(payerMsisdn) },
      payerMessage: String(payerMessage || "GTN plan purchase"),
      payeeNote: String(payeeNote || "GTN"),
    }),
  });

  // MTN often returns 202 with empty body
  if (!res.ok && res.status !== 202) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message || data?.error || `MTN requestToPay failed (${res.status})`);
  }

  return { ok: true, referenceId };
}

export async function getRequestToPayStatus(referenceId) {
  const token = await getAccessToken();
  const subKey = subscriptionKey();
  const res = await fetch(`${baseUrl()}/collection/v1_0/requesttopay/${encodeURIComponent(referenceId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": subKey,
      "X-Target-Environment": targetEnvironment(),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `MTN status failed (${res.status})`);
  }
  // status: PENDING | SUCCESSFUL | FAILED
  return { ok: true, status: String(data?.status || "").toUpperCase(), raw: data };
}

