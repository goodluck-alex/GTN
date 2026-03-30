import { prisma } from "../../prisma/client.js";

/**
 * All peer user ids that have any block row with `userId` (either side).
 * @param {number} userId
 * @returns {Promise<Set<number>>}
 */
export async function getPeerIdsInBlockRelationWith(userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid < 1) return new Set();

  const rows = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: uid }, { blockedId: uid }],
    },
    select: { blockerId: true, blockedId: true },
  });

  const ids = new Set();
  for (const r of rows) {
    if (r.blockerId === uid) ids.add(r.blockedId);
    else ids.add(r.blockerId);
  }
  return ids;
}

/**
 * No 1:1 interaction if a block exists in either direction.
 *
 * @param {number} userIdA
 * @param {number} userIdB
 * @throws {Error} when blocked
 */
export async function assertNotBlockedPair(userIdA, userIdB) {
  const a = Number(userIdA);
  const b = Number(userIdB);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) return;
  if (a === b) return;

  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });

  if (row) {
    throw new Error("You can’t message or call this person on GTN.");
  }
}

export async function listMyBlocks(blockerId) {
  return prisma.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: "desc" },
    include: {
      blocked: { select: { id: true, name: true, phone: true, subscriberId: true } },
    },
  });
}

export async function createBlock(blockerId, blockedId) {
  const sid = Number(blockerId);
  const bid = Number(blockedId);
  if (sid === bid) throw new Error("You can’t block yourself.");
  if (!Number.isFinite(bid) || bid < 1) throw new Error("Invalid user.");
  const target = await prisma.user.findUnique({ where: { id: bid }, select: { id: true } });
  if (!target) throw new Error("User not found.");

  return prisma.userBlock.upsert({
    where: {
      blockerId_blockedId: { blockerId: sid, blockedId: bid },
    },
    create: { blockerId: sid, blockedId: bid },
    update: {},
    include: {
      blocked: { select: { id: true, name: true, phone: true, subscriberId: true } },
    },
  });
}

export async function deleteBlock(blockerId, blockedId) {
  const sid = Number(blockerId);
  const bid = Number(blockedId);
  if (!Number.isFinite(bid) || bid < 1) throw new Error("Invalid user.");
  try {
    await prisma.userBlock.delete({
      where: { blockerId_blockedId: { blockerId: sid, blockedId: bid } },
    });
  } catch (e) {
    if (e && e.code === "P2025") throw new Error("Not blocked.");
    throw e;
  }
}
