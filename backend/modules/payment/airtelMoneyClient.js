function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function baseUrl() {
  // Sandbox: https://openapiuat.airtel.africa
  // Live:    https://openapi.airtel.africa
  return env("AIRTEL_BASE_URL", "https://openapiuat.airtel.africa").replace(/\/+$/, "");
}

function clientId() {
  return env("AIRTEL_CLIENT_ID", "");
}

function clientSecret() {
  return env("AIRTEL_CLIENT_SECRET", "");
}

function country() {
  return env("AIRTEL_COUNTRY", "UG");
}

function currency() {
  return env("AIRTEL_CURRENCY", "UGX");
}

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

let cachedToken = null;
let cachedExpMs = 0;

async function getToken() {
  const now = Date.now();
  if (cachedToken && cachedExpMs - 60_000 > now) return cachedToken;

  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) throw new Error("Airtel Money is not configured (missing client id/secret)");

  const res = await fetch(`${baseUrl()}/auth/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: id,
      client_secret: secret,
      grant_type: "client_credentials",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail =
      data?.message ||
      data?.error_description ||
      data?.error?.message ||
      (typeof data === "object" ? JSON.stringify(data) : String(data || ""));
    throw new Error(detail || `Airtel token failed (${res.status})`);
  }
  const token = data?.access_token;
  const expires = Number(data?.expires_in || 3600);
  if (!token) throw new Error("Airtel token missing access_token");
  cachedToken = token;
  cachedExpMs = now + expires * 1000;
  return token;
}

export async function initiatePayment({ transactionId, amount, msisdn, reference, country: countryOverride, currency: currencyOverride }) {
  const token = await getToken();
  const c = String(countryOverride || country()).trim().toUpperCase();
  const cur = String(currencyOverride || currency()).trim().toUpperCase();

  // Airtel often expects national MSISDN. Normalize from E.164 when possible.
  const digits = String(msisdn || "").replace(/\D/g, "");
  const cc = COUNTRY_DIALING[c] || "";
  const localMsisdn = cc && digits.startsWith(cc) ? digits.slice(cc.length) : digits;

  const res = await fetch(`${baseUrl()}/merchant/v1/payments/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Country": c,
      "X-Currency": cur,
    },
    body: JSON.stringify({
      reference: String(reference || "GTN plan purchase"),
      subscriber: { country: c, currency: cur, msisdn: String(localMsisdn) },
      transaction: { amount: Number(amount), country: c, currency: cur, id: String(transactionId) },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error?.message || `Airtel initiate failed (${res.status})`);
  }

  // Some responses include { status: { success: true }, data: { transaction: { id } } }
  const returnedId =
    data?.data?.transaction?.id ||
    data?.transaction?.id ||
    data?.data?.id ||
    transactionId;
  return { ok: true, transactionId: String(returnedId), raw: data };
}

export async function getPaymentStatus(transactionId, options = {}) {
  const token = await getToken();
  const c = String(options.country || country()).trim().toUpperCase();
  const cur = String(options.currency || currency()).trim().toUpperCase();

  const res = await fetch(`${baseUrl()}/standard/v1/payments/${encodeURIComponent(String(transactionId))}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Country": c,
      "X-Currency": cur,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error?.message || `Airtel status failed (${res.status})`);

  // Airtel returns status codes like TS (success), TF (failed), TP (pending)
  const code =
    data?.data?.transaction?.status ||
    data?.transaction?.status ||
    data?.data?.status ||
    data?.status ||
    "";
  return { ok: true, status: String(code).toUpperCase(), raw: data };
}

