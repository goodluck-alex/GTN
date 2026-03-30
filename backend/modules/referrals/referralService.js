import crypto from "crypto";
import { prisma } from "../../prisma/client.js";
import { getSocketIo } from "../../socket/ioInstance.js";

const DEFAULT_REFERRER_REWARD = 10;
const DEFAULT_REFERRED_BONUS = 5;
const DAILY_FREE_MINUTES = () => Math.max(0, Number(process.env.DAILY_FREE_MINUTES || 5));
const MAX_REFERRALS_PER_IP_PER_DAY = Math.max(1, Number(process.env.REFERRAL_MAX_PER_IP_DAY || 10));

function emitToReferrer(referrerId, payload) {
  const io = getSocketIo();
  if (!io) return;
  io.to(`user:${referrerId}`).emit("referral:completed", payload);
}

export async function logReferralClick({ refSubscriberId, source, sourceMeta, deviceKey, ipHash }) {
  const sid = parseInt(String(refSubscriberId).trim(), 10);
  if (!Number.isFinite(sid) || sid <= 0) return null;
  return prisma.referralClick.create({
    data: {
      refSubscriberId: sid,
      source: source ? String(source).slice(0, 64) : null,
      sourceMeta: sourceMeta ? String(sourceMeta).slice(0, 512) : null,
      deviceKey: deviceKey ? String(deviceKey).slice(0, 128) : null,
      ipHash: ipHash ? String(ipHash).slice(0, 64) : null,
    },
  });
}

/**
 * Grant once per UTC calendar day as free minutes.
 */
export async function ensureDailyFreeMinutes(userId) {
  const daily = DAILY_FREE_MINUTES();
  if (daily <= 0) return;

  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return;

  const today = new Date().toISOString().slice(0, 10);
  const last = u.lastDailyMinutesAt ? new Date(u.lastDailyMinutesAt).toISOString().slice(0, 10) : null;
  if (last === today) return;

  await prisma.user.update({
    where: { id: userId },
    data: {
      freeMinutes: { increment: daily },
      lastDailyMinutesAt: new Date(),
    },
  });
}

/**
 * Smart referral at signup: verified after OTP in same request; referrer reward deferred until activity.
 */
export async function recordSignupReferral(referrerSubscriberId, newUser, meta = {}) {
  const sid = parseInt(String(referrerSubscriberId).trim(), 10);
  if (!Number.isFinite(sid) || sid <= 0) return null;

  const referrer = await prisma.user.findUnique({ where: { subscriberId: sid } });
  if (!referrer || referrer.id === newUser.id) return null;

  const existing = await prisma.referral.findUnique({ where: { referredUserId: newUser.id } });
  if (existing) return null;

  const deviceKey = meta.deviceKey ? String(meta.deviceKey).slice(0, 128) : null;
  if (deviceKey && referrer.signupDeviceKey && deviceKey === referrer.signupDeviceKey) {
    console.warn("[GTN referral] Blocked: device matches referrer signup device");
    return null;
  }

  const ipHash = meta.signupIpHash || null;
  if (ipHash) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const count = await prisma.referral.count({
      where: {
        referrerId: referrer.id,
        signupIpHash: ipHash,
        createdAt: { gte: start },
      },
    });
    if (count >= MAX_REFERRALS_PER_IP_PER_DAY) {
      console.warn("[GTN referral] Blocked: IP daily cap for this referrer");
      return null;
    }
  }

  const referredBonus = DEFAULT_REFERRED_BONUS;
  const referrerReward = DEFAULT_REFERRER_REWARD;
  const now = new Date();

  await prisma.$transaction([
    prisma.referral.create({
      data: {
        referrerId: referrer.id,
        referredUserId: newUser.id,
        referredName: newUser.name,
        bonusMinutes: referrerReward,
        referredBonusMinutes: referredBonus,
        status: "verified",
        verifiedAt: now,
        source: meta.source ? String(meta.source).slice(0, 64) : null,
        sourceMeta: meta.sourceMeta ? String(meta.sourceMeta).slice(0, 512) : null,
        clickedAt: meta.clickedAt instanceof Date && !Number.isNaN(meta.clickedAt.getTime()) ? meta.clickedAt : null,
        deviceKey,
        signupIpHash: ipHash,
      },
    }),
    prisma.user.update({
      where: { id: newUser.id },
      data: { freeMinutes: { increment: referredBonus } },
    }),
  ]);

  return { ok: true };
}

/**
 * Complete referral when referred user does first call or first message.
 */
export async function tryCompleteReferralActivity(userId, trigger) {
  const allowed = new Set(["first_call", "first_message"]);
  if (!allowed.has(trigger)) return null;

  const referral = await prisma.referral.findFirst({
    where: { referredUserId: userId, status: "verified" },
    orderBy: { createdAt: "asc" },
  });
  if (!referral) return null;

  const now = new Date();
  const minutes = referral.bonusMinutes ?? DEFAULT_REFERRER_REWARD;

  await prisma.$transaction([
    prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "completed",
        completedAt: now,
        rewardedAt: now,
        completionTrigger: trigger,
      },
    }),
    prisma.user.update({
      where: { id: referral.referrerId },
      data: { freeMinutes: { increment: minutes } },
    }),
  ]);

  emitToReferrer(referral.referrerId, {
    type: "completed",
    referredName: referral.referredName,
    minutes,
    trigger,
  });

  return { ok: true, minutes };
}

export async function triggerReferralBonus(userId, referredName) {
  const referral = await prisma.referral.create({
    data: {
      referrerId: userId,
      referredName: referredName || "Friend",
      bonusMinutes: DEFAULT_REFERRER_REWARD,
      referredBonusMinutes: 0,
      status: "completed",
      verifiedAt: new Date(),
      completedAt: new Date(),
      rewardedAt: new Date(),
      completionTrigger: "manual_api",
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { freeMinutes: { increment: DEFAULT_REFERRER_REWARD } },
  });

  return referral;
}

export async function getReferrals(userId) {
  return prisma.referral.findMany({
    where: { referrerId: userId },
    orderBy: { createdAt: "desc" },
  });
}

export function hashIp(ip) {
  if (!ip) return null;
  const s = String(ip).trim();
  if (!s) return null;
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 64);
}

/**
 * Admin: complete a verified referral and credit referrer (same rules as activity completion).
 */
export async function adminCompleteReferralById(referralId) {
  const id = parseInt(String(referralId), 10);
  if (!Number.isFinite(id)) throw new Error("Invalid referral id");

  const referral = await prisma.referral.findUnique({ where: { id } });
  if (!referral) throw new Error("Referral not found");
  if (referral.status !== "verified") {
    throw new Error("Only verified referrals can be completed with reward");
  }

  const now = new Date();
  const minutes = referral.bonusMinutes ?? DEFAULT_REFERRER_REWARD;

  await prisma.$transaction([
    prisma.referral.update({
      where: { id: referral.id },
      data: {
        status: "completed",
        completedAt: now,
        rewardedAt: now,
        completionTrigger: "admin",
      },
    }),
    prisma.user.update({
      where: { id: referral.referrerId },
      data: { freeMinutes: { increment: minutes } },
    }),
  ]);

  emitToReferrer(referral.referrerId, {
    type: "completed",
    referredName: referral.referredName,
    minutes,
    trigger: "admin",
  });

  return prisma.referral.findUnique({ where: { id: referral.id } });
}

/**
 * Admin: cancel a non-completed referral (does not reverse minutes already granted at signup).
 */
export async function adminCancelReferralById(referralId) {
  const id = parseInt(String(referralId), 10);
  if (!Number.isFinite(id)) throw new Error("Invalid referral id");

  const referral = await prisma.referral.findUnique({ where: { id } });
  if (!referral) throw new Error("Referral not found");
  if (referral.status === "completed") {
    throw new Error("Cannot cancel a completed referral");
  }
  if (referral.status === "cancelled") {
    return referral;
  }

  return prisma.referral.update({
    where: { id },
    data: { status: "cancelled" },
  });
}
