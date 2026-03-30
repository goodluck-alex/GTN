import bcrypt from "bcryptjs";
import { prisma } from "../../prisma/client.js";

/**
 * @param {import("@prisma/client").User} user
 * @param {string} plain
 */
export async function verifyUserPassword(user, plain) {
  return bcrypt.compare(String(plain || ""), user.password);
}

/**
 * Verifies current password, sets new hash, bumps tokenVersion (all JWTs invalid).
 */
export async function changeUserPassword(userId, currentPlain, newPlain) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const ok = await verifyUserPassword(user, currentPlain);
  if (!ok) throw new Error("Current password is incorrect");
  const hash = await bcrypt.hash(String(newPlain), 10);
  await prisma.$transaction([
    prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        password: hash,
        tokenVersion: { increment: 1 },
      },
    }),
  ]);
}

/**
 * Hard-delete user after password check. Clears FK-safe data and relies on Prisma cascades
 * for Subscription, Payment, VoiceRoom (hosted), VoiceRoomParticipant, etc.
 */
export async function deleteUserAccount(userId, passwordPlain) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");
  const ok = await verifyUserPassword(user, passwordPlain);
  if (!ok) throw new Error("Password is incorrect");

  await prisma.$transaction(async (tx) => {
    await tx.referral.updateMany({
      where: { referredUserId: userId },
      data: { referredUserId: null },
    });

    await tx.message.deleteMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });

    await tx.voiceRoomMessage.deleteMany({
      where: { senderId: userId },
    });

    await tx.voiceRoomReaction.deleteMany({
      where: { OR: [{ userId: userId }, { targetUserId: userId }] },
    });

    await tx.call.updateMany({
      where: { callerUserId: userId },
      data: { callerUserId: null },
    });
    await tx.call.updateMany({
      where: { receiverUserId: userId },
      data: { receiverUserId: null },
    });

    await tx.planActivationAudit.deleteMany({
      where: { userId: userId },
    });

    await tx.user.delete({ where: { id: userId } });
  });
}
