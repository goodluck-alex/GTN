import { generateSecret, verify, generateURI } from "otplib";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export function createTotpSecret() {
  return generateSecret();
}

/** @param {string} secret @param {string} uiCode */
export async function verifyTotpToken(secret, uiCode) {
  if (!secret) return false;
  const c = String(uiCode || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  const result = await verify({ secret, token: c });
  return result.valid === true;
}

/** @param {string} email @param {string} secret */
export function totpKeyUri(email, secret) {
  const label = String(email || "user").trim() || "user";
  return generateURI({
    issuer: "GTN",
    label,
    secret,
  });
}

export function generatePlainBackupCodes(count = 8) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(crypto.randomBytes(5).toString("hex").toUpperCase());
  }
  return out;
}

/** @param {string[]} plainCodes */
export async function hashBackupCodes(plainCodes) {
  const hashes = [];
  for (const p of plainCodes) {
    hashes.push(await bcrypt.hash(String(p).toUpperCase().trim(), 10));
  }
  return hashes;
}

/** @param {unknown} storedRaw @param {string} code */
export async function tryConsumeBackupCode(storedRaw, code) {
  const normalized = String(code || "")
    .replace(/[\s-]/g, "")
    .toUpperCase();
  if (normalized.length < 8) return { ok: false, remaining: normalizeBackupHashesArray(storedRaw) };

  const arr = normalizeBackupHashesArray(storedRaw);
  for (let i = 0; i < arr.length; i++) {
    const match = await bcrypt.compare(normalized, String(arr[i]));
    if (match) {
      const remaining = arr.filter((_, j) => j !== i);
      return { ok: true, remaining };
    }
  }
  return { ok: false, remaining: arr };
}

/** @param {unknown} v @returns {string[]} */
export function normalizeBackupHashesArray(v) {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }
  return [];
}
