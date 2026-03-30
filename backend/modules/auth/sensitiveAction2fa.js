import { prisma } from "../../prisma/client.js";
import {
  normalizeBackupHashesArray,
  tryConsumeBackupCode,
  verifyTotpToken,
} from "./twoFactorHelpers.js";

/**
 * If the user has turned on 2FA, require a valid TOTP or one backup code for high-risk operations.
 * When 2FA is off, this is a no-op (2FA remains fully optional).
 *
 * @param {import("@prisma/client").User | null} user
 * @param {unknown} codeFromClient
 */
export async function assert2faForSensitiveAction(user, codeFromClient) {
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) return;

  const c = String(codeFromClient ?? "").trim();
  if (!c) {
    throw new Error(
      "Two-factor authentication is on. Enter your 6-digit authenticator code or a backup code to continue."
    );
  }

  if (await verifyTotpToken(user.twoFactorSecret, c)) return;

  const hashes = normalizeBackupHashesArray(user.twoFactorBackupHashes);
  const consumed = await tryConsumeBackupCode(hashes, c);
  if (!consumed.ok) {
    throw new Error("Invalid authenticator or backup code.");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorBackupHashes: consumed.remaining },
  });
}

/** @param {number} userId */
export async function loadUserForSensitive2fa(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      twoFactorEnabled: true,
      twoFactorSecret: true,
      twoFactorBackupHashes: true,
    },
  });
}
