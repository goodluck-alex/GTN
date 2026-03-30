function env(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function baseUrl() {
  return env("TRONGRID_BASE_URL", "https://api.trongrid.io").replace(/\/+$/, "");
}

function apiKey() {
  return env("TRONGRID_API_KEY", "");
}

function nowPlusMinutes(mins) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + mins);
  return d.toISOString();
}

function parseIsoMs(iso) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function approxEq(a, b, eps = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= eps;
}

async function fetchJson(url) {
  const headers = {};
  const k = apiKey();
  if (k) headers["TRON-PRO-API-KEY"] = k;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.message || data?.error || `TronGrid request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const usdtTrc20Adapter = {
  method: "crypto",
  provider: "USDT_TRC20",
  async process({ payment, plan }) {
    const walletAddress = env("USDT_WALLET", "") || env("USDT_TRC20_MASTER_ADDRESS", "");
    if (!walletAddress) {
      throw new Error("USDT TRC20 is not configured (missing USDT_WALLET)");
    }
    const confirmationsRequired = Number(process.env.USDT_TRC20_CONFIRMATIONS || 1);
    const expiresInMinutes = Number(process.env.USDT_TRC20_EXPIRES_MIN || 60);

    const expectedAmount = payment.amount;
    const expiresAt = nowPlusMinutes(expiresInMinutes);

    return {
      ok: true,
      crypto: {
        asset: "USDT_TRC20",
        address: walletAddress,
        contract: USDT_TRC20_CONTRACT,
        expectedAmount,
        expiresAt,
        confirmationsRequired,
        memo: payment.reference,
      },
    };
  },
  async checkStatus() {
    return { status: "pending" }; // server polling uses confirm path for crypto
  },
  async confirm({ payment, payload }) {
    const walletAddress = env("USDT_WALLET", "") || env("USDT_TRC20_MASTER_ADDRESS", "");
    if (!walletAddress) {
      throw new Error("USDT TRC20 is not configured (missing USDT_WALLET)");
    }

    const expiresAt = payment?.metadata?.crypto?.expiresAt || payment?.metadata?.expiresAt;
    if (expiresAt) {
      const expMs = parseIsoMs(expiresAt);
      if (expMs && Date.now() > expMs) {
        return { status: "expired" };
      }
    }

    const expected = Number(payment.amount);
    const minConf = Number(payment?.metadata?.crypto?.confirmationsRequired || process.env.USDT_TRC20_CONFIRMATIONS || 1);

    // If user provides txHash, verify it exists in recent transfers to our address.
    const txHash = String(payload?.txHash || payload?.transactionId || "").trim();

    // TronGrid endpoint: account TRC20 transfers
    const url =
      `${baseUrl()}/v1/accounts/${encodeURIComponent(walletAddress)}/transactions/trc20` +
      `?limit=50&only_confirmed=true&contract_address=${USDT_TRC20_CONTRACT}`;

    const data = await fetchJson(url);
    const txs = Array.isArray(data?.data) ? data.data : [];

    const withinWindowMs = Number(process.env.USDT_TRC20_LOOKBACK_MIN || 120) * 60_000;
    const floorMs = Date.now() - withinWindowMs;

    const match = txs.find((tx) => {
      const id = String(tx?.transaction_id || tx?.transactionId || "");
      if (txHash && id !== txHash) return false;

      const to = String(tx?.to || "").toLowerCase();
      if (to && to !== String(walletAddress).toLowerCase()) return false;

      const decimals = Number(tx?.token_info?.decimals ?? 6);
      const rawVal = String(tx?.value ?? "0");
      const amount = Number(rawVal) / Math.pow(10, decimals || 6);
      if (!approxEq(amount, expected)) return false;

      const ts = Number(tx?.block_timestamp || 0);
      if (ts && ts < floorMs) return false;

      // TronGrid already filtered only_confirmed=true. We treat it as >= 1 confirmation.
      return minConf <= 1;
    });

    if (!match) return { status: "pending" };

    return {
      status: "succeeded",
      providerTxnId: String(match.transaction_id || match.transactionId || ""),
      raw: match,
    };
  },
};

