import { prisma } from "../../prisma/client.js";
import * as callBilling from "./callBillingService.js";

export async function startCall({ callerPhone, receiverPhone, callerUserId, receiverUserId }) {
  if (callerUserId == null) {
    throw new Error("callerUserId is required for billing");
  }

  await callBilling.assertCanAffordFirstMinute(callerUserId);

  const call = await prisma.call.create({
    data: {
      callerPhone,
      receiverPhone,
      callerUserId,
      receiverUserId: receiverUserId ?? null,
      status: "started",
    },
  });

  try {
    callBilling.registerBillingSession(call.id, callerUserId);
  } catch (e) {
    await prisma.call.delete({ where: { id: call.id } }).catch(() => {});
    throw e;
  }

  return call;
}

/** @deprecated Use endCallForParticipant */
export async function endCall(callId, duration) {
  const id = parseInt(callId, 10);
  if (!Number.isFinite(id)) throw new Error("Invalid callId");
  const d = duration == null ? 0 : Math.max(0, parseInt(duration, 10) || 0);
  return prisma.call.update({
    where: { id },
    data: {
      duration: d,
      status: "ended",
    },
  });
}

/**
 * Mark call ended with duration (minutes). Only caller or receiver may update.
 */
export async function endCallForParticipant(callId, duration, userPhone) {
  const id = parseInt(callId, 10);
  if (!Number.isFinite(id)) throw new Error("Invalid callId");

  const call = await prisma.call.findUnique({ where: { id } });
  if (!call) throw new Error("Call not found");
  if (call.callerPhone !== userPhone && call.receiverPhone !== userPhone) {
    const err = new Error("Forbidden");
    err.code = "FORBIDDEN";
    throw err;
  }

  if (call.status === "ended" || call.status === "missed") {
    return call;
  }

  const d = duration == null ? 0 : Math.max(0, parseInt(duration, 10) || 0);
  const updated = await prisma.call.update({
    where: { id },
    data: {
      duration: d,
      status: "ended",
    },
  });

  if (call.callerUserId) {
    callBilling.unregisterBillingSession(call.id, call.callerUserId);
  }

  return updated;
}

export async function getUserCalls(userPhone) {
  return prisma.call.findMany({
    where: {
      OR: [
        { callerPhone: userPhone },
        { receiverPhone: userPhone }
      ]
    },
    orderBy: { createdAt: "desc" }
  });
}
