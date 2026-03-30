import { prisma } from "../../prisma/client.js";
import { isUnlimitedActive } from "../plans/plansService.js";
import { applyFreeMinuteDeductionTx } from "../plans/plansMinuteDeduction.js";

/** Active billing sessions: callId -> { callerUserId, nextMinute } */
const sessions = new Map();
/** One billable call per caller at a time */
const userActiveCall = new Map();

export function getActiveBillingCallId(userId) {
  return userActiveCall.get(userId) ?? null;
}

/**
 * @param {number} callId
 * @param {number} callerUserId
 */
export function registerBillingSession(callId, callerUserId) {
  const id = Number(callId);
  if (!Number.isFinite(id)) {
    const err = new Error("Invalid call");
    err.code = "BAD_CALL";
    throw err;
  }
  const existing = userActiveCall.get(callerUserId);
  if (existing != null && existing !== id) {
    const err = new Error("You already have an active call.");
    err.code = "CONCURRENT_CALL";
    throw err;
  }
  sessions.set(id, { callerUserId, nextMinute: 1 });
  userActiveCall.set(callerUserId, id);
}

/**
 * @param {number} callId
 * @param {number} callerUserId
 */
export function unregisterBillingSession(callId, callerUserId) {
  const id = Number(callId);
  const s = sessions.get(id);
  if (!s || s.callerUserId !== callerUserId) return;
  sessions.delete(id);
  if (userActiveCall.get(callerUserId) === id) {
    userActiveCall.delete(callerUserId);
  }
}

/**
 * Caller must have ≥1 free minute or an active unlimited plan before starting.
 * @param {number} userId
 */
export async function assertCanAffordFirstMinute(userId) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) {
    const err = new Error("User not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (isUnlimitedActive(u)) {
    return { ok: true, freeMinutes: u.freeMinutes, unlimited: true };
  }
  if (u.freeMinutes >= 1) return { ok: true, freeMinutes: u.freeMinutes, unlimited: false };
  const err = new Error("Insufficient free minutes to start call.");
  err.code = "INSUFFICIENT_FUNDS";
  throw err;
}

/**
 * Server-side per-minute charge. Sequence must be 1, 2, 3, …
 * @param {number} callId
 * @param {number} callerUserId
 * @param {number} minuteIndex
 */
export async function processBillingTick(callId, callerUserId, minuteIndex) {
  const id = Number(callId);
  if (!Number.isFinite(id)) {
    return { ok: false, error: "bad_call" };
  }
  const s = sessions.get(id);
  if (!s || s.callerUserId !== callerUserId) {
    return { ok: false, error: "invalid_session" };
  }
  if (minuteIndex !== s.nextMinute) {
    return { ok: false, error: "sequence", expected: s.nextMinute, got: minuteIndex };
  }

  try {
    const out = await prisma.$transaction(async (tx) => {
      const call = await tx.call.findUnique({ where: { id } });
      if (!call || call.callerUserId !== callerUserId) {
        throw Object.assign(new Error("Call not found"), { code: "NOT_FOUND" });
      }

      const u = await tx.user.findUnique({ where: { id: callerUserId } });
      if (u && isUnlimitedActive(u)) {
        await tx.call.update({
          where: { id },
          data: { minutesBilled: { increment: 1 } },
        });
        s.nextMinute += 1;
        return {
          freeMinutes: u.freeMinutes,
          usedFree: false,
          unlimited: true,
        };
      }

      const d = await applyFreeMinuteDeductionTx(tx, callerUserId);
      await tx.call.update({
        where: { id },
        data: {
          minutesBilled: { increment: 1 },
          freeMinutesUsed: { increment: 1 },
        },
      });

      s.nextMinute += 1;

      const fresh = await tx.user.findUnique({ where: { id: callerUserId } });
      return {
        freeMinutes: fresh.freeMinutes,
        usedFree: d.usedFree,
      };
    });

    return { ok: true, ...out };
  } catch (e) {
    if (e?.code === "INSUFFICIENT_FUNDS" || e?.message === "INSUFFICIENT") {
      return { ok: false, error: "insufficient" };
    }
    throw e;
  }
}
