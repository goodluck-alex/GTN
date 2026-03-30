import { prisma } from "../../prisma/client.js";
import { randomUUID } from "crypto";
import * as referralService from "../referrals/referralService.js";
import { assertCanAffordFirstMinute } from "../calls/callBillingService.js";
import * as voiceRoomBilling from "./voiceRoomBillingService.js";
import { assertCanJoinOthersVoiceRoom } from "./voiceRoomPolicy.js";

export const getRooms = () =>
  prisma.voiceRoom.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  });

export const getRoomById = (id) =>
  prisma.voiceRoom.findUnique({
    where: { id: String(id) },
    include: {
      host: { select: { id: true, name: true, phone: true, subscriberId: true } },
      participants: {
        where: { leftAt: null },
        include: { user: { select: { id: true, name: true, subscriberId: true } } },
      },
    },
  });

/**
 * @param {{ name: string, privacy?: string, maxParticipants?: number }} data
 * @param {number} userId
 */
export async function createRoom(data, userId) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("name is required");
  const privacy = ["public", "private"].includes(String(data.privacy)) ? data.privacy : "public";
  const maxP = Math.min(500, Math.max(2, Number(data.maxParticipants) || 50));

  const room = await prisma.voiceRoom.create({
    data: {
      name,
      createdBy: userId,
      privacy,
      maxParticipants: maxP,
    },
  });

  await prisma.voiceRoomParticipant.create({
    data: {
      id: randomUUID(),
      roomId: room.id,
      userId,
      role: "host",
    },
  });

  return getRoomById(room.id);
}

export async function deleteRoom(id, userId) {
  const room = await prisma.voiceRoom.findUnique({ where: { id: String(id) } });
  if (!room) throw new Error("Room not found");
  if (room.createdBy !== userId) {
    const err = new Error("Only the host can delete the room");
    err.code = "FORBIDDEN";
    throw err;
  }
  await prisma.voiceRoom.delete({ where: { id: String(id) } });
}

/**
 * @param {string} roomId
 * @param {number} userId
 * @param {{ mode?: "speak"|"listen" }} opts
 */
export async function joinRoom(roomId, userId, opts = {}) {
  await referralService.ensureDailyFreeMinutes(userId);

  const room = await prisma.voiceRoom.findUnique({ where: { id: String(roomId) } });
  if (!room || room.status !== "active") throw new Error("Room not found or ended");

  if (room.createdBy !== userId) {
    await assertCanJoinOthersVoiceRoom(userId, room.createdBy);
  }

  const activeCount = await prisma.voiceRoomParticipant.count({
    where: { roomId: room.id, leftAt: null },
  });
  if (activeCount >= room.maxParticipants) {
    const err = new Error("Room is full");
    err.code = "ROOM_FULL";
    throw err;
  }

  const mode = opts.mode === "listen" ? "listen" : "speak";
  const role =
    room.createdBy === userId
      ? "host"
      : mode === "listen"
        ? "listener"
        : "participant";

  if (role !== "listener" && role !== "host") {
    await assertCanAffordFirstMinute(userId);
  }

  const existing = await prisma.voiceRoomParticipant.findUnique({
    where: { roomId_userId: { roomId: room.id, userId } },
  });

  if (existing) {
    if (existing.leftAt == null) {
      return getRoomById(room.id);
    }
    await prisma.voiceRoomParticipant.update({
      where: { roomId_userId: { roomId: room.id, userId } },
      data: {
        leftAt: null,
        joinedAt: new Date(),
        role: role === "host" ? "host" : existing.role === "host" ? "host" : role,
      },
    });
  } else {
    await prisma.voiceRoomParticipant.create({
      data: {
        id: randomUUID(),
        roomId: room.id,
        userId,
        role,
      },
    });
  }

  return getRoomById(room.id);
}

export async function leaveRoom(roomId, userId) {
  const rid = String(roomId);
  voiceRoomBilling.unregisterSpeakingSession(rid, userId);

  const part = await prisma.voiceRoomParticipant.findUnique({
    where: { roomId_userId: { roomId: rid, userId } },
  });
  if (!part || part.leftAt) return null;

  await prisma.voiceRoomParticipant.update({
    where: { roomId_userId: { roomId: rid, userId } },
    data: { leftAt: new Date() },
  });

  return { ok: true };
}

export async function endRoom(roomId, userId) {
  const room = await prisma.voiceRoom.findUnique({ where: { id: String(roomId) } });
  if (!room) throw new Error("Room not found");
  if (room.createdBy !== userId) {
    const err = new Error("Only the host can end the room");
    err.code = "FORBIDDEN";
    throw err;
  }
  await prisma.voiceRoom.update({
    where: { id: room.id },
    data: { status: "ended", endedAt: new Date() },
  });
  return { ok: true };
}

/** Admin console: end any active room (ops). */
export async function adminEndVoiceRoom(roomId) {
  const room = await prisma.voiceRoom.findUnique({ where: { id: String(roomId) } });
  if (!room) throw new Error("Room not found");
  if (room.status !== "active") {
    throw new Error(`Room is not active (status: ${room.status})`);
  }
  await prisma.voiceRoom.update({
    where: { id: room.id },
    data: { status: "ended", endedAt: new Date() },
  });
  return prisma.voiceRoom.findUnique({ where: { id: room.id } });
}

export async function listMessages(roomId, { limit = 50 } = {}) {
  return prisma.voiceRoomMessage.findMany({
    where: { roomId: String(roomId) },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, limit)),
  });
}

export async function postMessage(roomId, userId, content) {
  const text = String(content || "").trim().slice(0, 4000);
  if (!text) throw new Error("content is required");

  const part = await prisma.voiceRoomParticipant.findFirst({
    where: { roomId: String(roomId), userId, leftAt: null },
  });
  if (!part) throw new Error("Join the room before chatting");

  return prisma.voiceRoomMessage.create({
    data: {
      roomId: String(roomId),
      senderId: userId,
      content: text,
      type: "text",
    },
  });
}

export async function postReaction(roomId, userId, emoji, targetUserId = null) {
  const allowed = new Set(["👏", "❤️", "🔥", "🎉", "👍"]);
  const e = String(emoji || "").trim();
  if (!allowed.has(e)) throw new Error("Invalid reaction");

  const part = await prisma.voiceRoomParticipant.findFirst({
    where: { roomId: String(roomId), userId, leftAt: null },
  });
  if (!part) throw new Error("Join the room first");

  return prisma.voiceRoomReaction.create({
    data: {
      id: randomUUID(),
      roomId: String(roomId),
      userId,
      targetUserId: targetUserId != null ? Number(targetUserId) : null,
      emoji: e,
    },
  });
}

export async function setParticipantMuted(roomId, targetUserId, actorUserId, muted) {
  const room = await prisma.voiceRoom.findUnique({ where: { id: String(roomId) } });
  if (!room) throw new Error("Room not found");

  const actor = await prisma.voiceRoomParticipant.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: actorUserId } },
  });
  if (!actor || actor.leftAt || !["host", "moderator"].includes(actor.role)) {
    const err = new Error("Only host or moderator can mute");
    err.code = "FORBIDDEN";
    throw err;
  }

  await prisma.voiceRoomParticipant.update({
    where: { roomId_userId: { roomId: room.id, userId: targetUserId } },
    data: { muted: Boolean(muted) },
  });

  return { ok: true, muted: Boolean(muted) };
}
