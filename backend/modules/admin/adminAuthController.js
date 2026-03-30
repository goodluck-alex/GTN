import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../prisma/client.js";
import { getAdminJwtSecret } from "./adminAuthMiddleware.js";

const MAX_FAILED_BEFORE_LOCK = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

export async function adminLogin(req, res) {
  const secret = getAdminJwtSecret();
  if (!secret) {
    return res.status(503).json({ ok: false, error: "Admin auth is not configured (ADMIN_JWT_SECRET)" });
  }

  const email = String(req.body?.email || "")
    .trim()
    .toLowerCase();
  const password = String(req.body?.password || "");

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: "email and password are required", code: "VALIDATION" });
  }

  try {
    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) {
      return res.status(401).json({ ok: false, error: "Invalid email or password", code: "AUTH_FAILED" });
    }

    const now = new Date();

    if (admin.lockedUntil) {
      if (admin.lockedUntil > now) {
        return res.status(429).json({
          ok: false,
          error: "Account temporarily locked after failed sign-ins. Try again later.",
          code: "ACCOUNT_LOCKED",
        });
      }
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { lockedUntil: null, failedLoginCount: 0 },
      });
      admin.failedLoginCount = 0;
      admin.lockedUntil = null;
    }

    const ok = await bcrypt.compare(password, admin.password);
    if (!ok) {
      const fails = (admin.failedLoginCount ?? 0) + 1;
      const patch = { failedLoginCount: fails };
      if (fails >= MAX_FAILED_BEFORE_LOCK) {
        patch.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
        patch.failedLoginCount = 0;
      }
      await prisma.adminUser.update({ where: { id: admin.id }, data: patch });
      return res.status(401).json({ ok: false, error: "Invalid email or password", code: "AUTH_FAILED" });
    }

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const token = jwt.sign(
      { id: admin.id, typ: "admin", tv: admin.tokenVersion ?? 0 },
      secret,
      { expiresIn: "12h" }
    );

    return res.json({
      ok: true,
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("adminLogin", err);
    return res.status(500).json({ ok: false, error: err?.message || "Login failed", code: "SERVER" });
  }
}

export async function adminMe(req, res) {
  return res.json({
    ok: true,
    admin: req.admin,
  });
}
