import { prisma } from "../../prisma/client.js";

/**
 * Deduct one minute from freeMinutes (no wallet/balance).
 * Must run inside prisma.$transaction callback.
 */
export async function applyFreeMinuteDeductionTx(tx, userId) {
  const u = await tx.user.findUnique({ where: { id: userId } });
  if (!u) throw Object.assign(new Error("User not found"), { code: "NOT_FOUND" });
  if (u.freeMinutes >= 1) {
    const up = await tx.user.updateMany({
      where: { id: userId, freeMinutes: { gte: 1 } },
      data: { freeMinutes: { decrement: 1 } },
    });
    if (up.count !== 1) {
      throw Object.assign(new Error("Concurrent billing conflict"), { code: "RACE" });
    }
    return { usedFree: true };
  }
  const err = new Error("INSUFFICIENT");
  err.code = "INSUFFICIENT_FUNDS";
  throw err;
}

export async function assertHasFreeMinuteOrUnlimited(userId, isUnlimitedFn) {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) throw Object.assign(new Error("User not found"), { code: "NOT_FOUND" });
  if (isUnlimitedFn?.(u)) return { ok: true, freeMinutes: u.freeMinutes, unlimited: true };
  if (u.freeMinutes >= 1) return { ok: true, freeMinutes: u.freeMinutes, unlimited: false };
  const err = new Error("Insufficient free minutes to start call.");
  err.code = "INSUFFICIENT_FUNDS";
  throw err;
}

