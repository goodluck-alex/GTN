import jwt from "jsonwebtoken";
import { prisma } from "../prisma/client.js";
import { assertSessionForUser } from "../modules/auth/sessionService.js";

export async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.status(401).json({ error: "Invalid token" });

    const tokenTv = Number(decoded.tv ?? 0);
    const currentTv = user.tokenVersion ?? 0;
    if (tokenTv !== currentTv) {
      return res.status(401).json({ error: "Session revoked. Please sign in again." });
    }

    const jtiRaw = decoded.jti != null ? String(decoded.jti).trim() : "";
    if (jtiRaw) {
      try {
        await assertSessionForUser(jtiRaw, user.id, { touch: true });
      } catch {
        return res.status(401).json({ error: "Session revoked. Please sign in again." });
      }
    }

    req.tokenJti = jtiRaw || null;

    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Authentication failed" });
  }
}
