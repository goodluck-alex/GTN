import jwt from "jsonwebtoken";
import { prisma } from "../../prisma/client.js";

export function getAdminJwtSecret() {
  const s = (process.env.ADMIN_JWT_SECRET || "").trim();
  if (!s) return null;
  return s;
}

/**
 * Express middleware: Bearer JWT signed with ADMIN_JWT_SECRET, payload typ === "admin".
 */
export async function authenticateAdmin(req, res, next) {
  const secret = getAdminJwtSecret();
  if (!secret) {
    return res.status(503).json({ ok: false, error: "Admin auth is not configured (ADMIN_JWT_SECRET)" });
  }

  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ ok: false, error: "No token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      return res.status(401).json({ ok: false, error: "Invalid or expired token" });
    }

    if (decoded.typ !== "admin" || decoded.id == null) {
      return res.status(403).json({ ok: false, error: "Not an admin token" });
    }

    const admin = await prisma.adminUser.findUnique({ where: { id: decoded.id } });
    if (!admin) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    const tokenTv = Number(decoded.tv ?? 0);
    const currentTv = admin.tokenVersion ?? 0;
    if (tokenTv !== currentTv) {
      return res.status(401).json({ ok: false, error: "Session revoked. Sign in again." });
    }

    req.admin = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
    };
    next();
  } catch (err) {
    console.error("authenticateAdmin", err);
    return res.status(401).json({ ok: false, error: "Authentication failed" });
  }
}
