import { randomUUID } from "crypto";
import { prisma } from "../../prisma/client.js";
import * as referralService from "../referrals/referralService.js";
import { getClientIp } from "./clientIp.js";

/**
 * Persist a new login session and return its `jti` (embedded in the JWT).
 *
 * @param {import("@prisma/client").User} user
 * @param {import("express").Request | undefined} req
 */
export async function createUserSession(user, req) {
  const jti = randomUUID();
  const ua =
    req?.headers?.["user-agent"] != null ? String(req.headers["user-agent"]).slice(0, 400) : null;
  const ip = req ? getClientIp(req) : "";
  const ipHash = ip ? referralService.hashIp(ip) : null;

  await prisma.userSession.create({
    data: {
      userId: user.id,
      jti,
      userAgent: ua || null,
      ipHash: ipHash || null,
    },
  });

  return jti;
}

/**
 * @param {string} jti
 * @returns {Promise<boolean>}
 */
export async function isSessionActive(jti) {
  if (!jti) return false;
  const s = await prisma.userSession.findUnique({
    where: { jti: String(jti) },
    select: { revokedAt: true },
  });
  return Boolean(s && s.revokedAt == null);
}

/**
 * Ensures session belongs to user and is active. Optionally bumps lastSeenAt.
 *
 * @param {string} jti
 * @param {number} userId
 * @param {{ touch?: boolean }} [opts]
 */
export async function assertSessionForUser(jti, userId, opts = {}) {
  const jid = String(jti || "").trim();
  if (!jid) {
    const err = new Error("Session revoked. Please sign in again.");
    err.code = "SESSION_REVOKED";
    throw err;
  }
  const sid = Number(userId);
  const s = await prisma.userSession.findUnique({
    where: { jti: jid },
    select: { id: true, userId: true, revokedAt: true },
  });
  if (!s || s.userId !== sid || s.revokedAt != null) {
    const err = new Error("Session revoked. Please sign in again.");
    err.code = "SESSION_REVOKED";
    throw err;
  }
  if (opts.touch) {
    await prisma.userSession.update({
      where: { jti: jid },
      data: { lastSeenAt: new Date() },
    });
  }
}

/** @param {number} userId */
export async function revokeAllUserSessions(userId) {
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * @param {number} userId
 * @param {string} sessionId uuid of UserSession row
 */
export async function revokeUserSessionById(userId, sessionId) {
  const sid = String(sessionId || "").trim();
  if (!sid) throw new Error("Invalid session");

  const row = await prisma.userSession.findFirst({
    where: { id: sid, userId, revokedAt: null },
    select: { id: true },
  });
  if (!row) throw new Error("Session not found");

  await prisma.userSession.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  });
}

/**
 * @param {number} userId
 */
export async function listActiveSessionsForUser(userId) {
  return prisma.userSession.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      jti: true,
      createdAt: true,
      lastSeenAt: true,
      userAgent: true,
      ipHash: true,
    },
  });
}
