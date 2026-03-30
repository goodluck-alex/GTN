import { prisma } from "../../prisma/client.js";
import { getSocketIo } from "../../socket/ioInstance.js";
import { applyFreeMinuteDeductionTx } from "../plans/plansMinuteDeduction.js";
import {
  assertCanAffordFirstMinute,
  getActiveBillingCallId,
} from "../calls/callBillingService.js";

/** `${roomId}:${userId}` -> { nextMinute: number } */
const speakingSessions = new Map();
/** userId -> `${roomId}:${userId}` */
const userSpeakingKey = new Map();

function sessionKey(roomId, userId) {
  return `${String(roomId)}:${Number(userId)}`;
}

/**
 * Start billing for unmuted speaking. Requires afford first minute.
 * @param {string} roomId
 * @param {number} userId
 */
export async function registerSpeakingSession(roomId, userId) {
  const k = sessionKey(roomId, userId);
  const existing = userSpeakingKey.get(userId);
  if (existing && existing !== k) {
    const err = new Error("Already in an active speaking billing session.");
    err.code = "CONCURRENT_SPEAK";
    throw err;
  }
  const callId = getActiveBillingCallId(userId);
  if (callId != null) {
    const err = new Error("End your phone call before speaking in a room.");
    err.code = "CONCURRENT_CALL";
    throw err;
  }

  await assertCanAffordFirstMinute(userId);

  speakingSessions.set(k, { nextMinute: 1 });
  userSpeakingKey.set(userId, k);
}

export function unregisterSpeakingSession(roomId, userId) {
  const k = sessionKey(roomId, userId);
  if (!speakingSessions.has(k)) return;
  speakingSessions.delete(k);
  if (userSpeakingKey.get(userId) === k) {
    userSpeakingKey.delete(userId);
  }
}

/**
 * @param {string} roomId
 * @param {number} userId
 * @param {number} minuteIndex
 */
export async function processSpeakingTick(roomId, userId, minuteIndex) {
  const k = sessionKey(roomId, userId);
  const s = speakingSessions.get(k);
  if (!s) {
    return { ok: false, error: "invalid_session" };
  }
  if (minuteIndex !== s.nextMinute) {
    return { ok: false, error: "sequence", expected: s.nextMinute, got: minuteIndex };
  }

  const rid = String(roomId);
  try {
    const out = await prisma.$transaction(async (tx) => {
      const part = await tx.voiceRoomParticipant.findUnique({
        where: { roomId_userId: { roomId: rid, userId } },
      });
      if (!part || part.leftAt != null) {
        throw Object.assign(new Error("Not in room"), { code: "NOT_IN_ROOM" });
      }
      if (part.role === "listener") {
        throw Object.assign(new Error("Listeners are not charged"), { code: "NOT_SPEAKER" });
      }

      const d = await applyFreeMinuteDeductionTx(tx, userId);

      await tx.voiceRoomParticipant.update({
        where: { roomId_userId: { roomId: rid, userId } },
        data: {
          minutesUsed: { increment: 1 },
          paidAmount: { increment: 0 },
        },
      });

      s.nextMinute += 1;

      const fresh = await tx.user.findUnique({ where: { id: userId } });
      return {
        freeMinutes: fresh.freeMinutes,
        usedFree: d.usedFree,
      };
    });

    const io = getSocketIo();
    if (io) {
      io.to(`vr:${rid}`).emit("voice_room:plan_tick", {
        roomId: rid,
        userId,
        freeMinutes: out.freeMinutes,
      });
      // Legacy event name kept for backward compatibility.
      io.to(`vr:${rid}`).emit("voice_room:wallet_tick", {
        roomId: rid,
        userId,
        freeMinutes: out.freeMinutes,
      });
    }

    return { ok: true, ...out };
  } catch (e) {
    if (e?.code === "INSUFFICIENT_FUNDS" || e?.message === "INSUFFICIENT") {
      return { ok: false, error: "insufficient" };
    }
    if (e?.code === "NOT_IN_ROOM" || e?.code === "NOT_SPEAKER") {
      return { ok: false, error: e.code === "NOT_SPEAKER" ? "listener" : "not_in_room" };
    }
    throw e;
  }
}

export function getMinuteCost() {
  return 1;
}
