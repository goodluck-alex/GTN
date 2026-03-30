import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { prisma } from "../../prisma/client.js";
import {
  createTotpSecret,
  generatePlainBackupCodes,
  hashBackupCodes,
  normalizeBackupHashesArray,
  totpKeyUri,
  tryConsumeBackupCode,
  verifyTotpToken,
} from "../auth/twoFactorHelpers.js";

export async function post2faSetup(req, res) {
  try {
    const userId = req.user.id;
    const fresh = await prisma.user.findUnique({ where: { id: userId } });
    if (!fresh) return res.status(404).json({ message: "User not found" });
    if (fresh.twoFactorEnabled) {
      return res.status(400).json({ message: "Two-factor authentication is already on." });
    }

    const secret = createTotpSecret();
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorPendingSecret: secret },
    });

    const email = fresh.email || `user-${userId}`;
    const otpauthUrl = totpKeyUri(email, secret);
    let qrDataUrl = null;
    try {
      qrDataUrl = await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 });
    } catch {
      /* optional */
    }

    res.json({ otpauthUrl, secret, qrDataUrl });
  } catch (err) {
    res.status(400).json({ message: err.message || "setup_failed" });
  }
}

export async function post2faEnable(req, res) {
  try {
    const code = String(req.body?.code || "").replace(/\s/g, "");
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.twoFactorEnabled) {
      return res.status(400).json({ message: "Two-factor authentication is already on." });
    }
    if (!user.twoFactorPendingSecret) {
      return res.status(400).json({ message: "Start setup first (scan QR / enter secret), then enter a 6-digit code." });
    }

    const ok = await verifyTotpToken(user.twoFactorPendingSecret, code);
    if (!ok) {
      return res.status(400).json({ message: "Invalid code. Check your authenticator app time is synced." });
    }

    const plainCodes = generatePlainBackupCodes(8);
    const hashes = await hashBackupCodes(plainCodes);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorSecret: user.twoFactorPendingSecret,
        twoFactorPendingSecret: null,
        twoFactorBackupHashes: hashes,
      },
    });

    res.json({ twoFactorEnabled: true, backupCodes: plainCodes });
  } catch (err) {
    res.status(400).json({ message: err.message || "enable_failed" });
  }
}

export async function post2faDisable(req, res) {
  try {
    const password = String(req.body?.password || "");
    const code = String(req.body?.code ?? "").trim();

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.twoFactorEnabled) {
      return res.status(400).json({ message: "Two-factor authentication is not enabled." });
    }

    const validPw = await bcrypt.compare(password, user.password);
    if (!validPw) {
      return res.status(401).json({ message: "Incorrect password." });
    }

    const totpOk = await verifyTotpToken(user.twoFactorSecret, code);
    if (totpOk) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorBackupHashes: [],
        },
      });
      return res.json({ ok: true, twoFactorEnabled: false });
    }

    const hashes = normalizeBackupHashesArray(user.twoFactorBackupHashes);
    const consumed = await tryConsumeBackupCode(hashes, code);
    if (!consumed.ok) {
      return res.status(400).json({ message: "Invalid authenticator or backup code." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorPendingSecret: null,
        twoFactorBackupHashes: [],
      },
    });
    res.json({ ok: true, twoFactorEnabled: false });
  } catch (err) {
    res.status(400).json({ message: err.message || "disable_failed" });
  }
}
