import { prisma } from "../../prisma/client.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VOICE_DIR = path.join(__dirname, "..", "..", "uploads", "voice");
const MAX_VOICE_BYTES = 2 * 1024 * 1024; // 2 MB

async function ensureVoiceDir() {
  await fs.mkdir(VOICE_DIR, { recursive: true });
}

export async function sendMessage({ senderId, receiverId, type, content }) {
  return prisma.message.create({
    data: {
      fromUserId: senderId,
      toUserId: receiverId,
      type,
      content,
      deliveryStatus: "sent",
    },
  });
}

export async function getChatHistory(user1, user2) {
  return prisma.message.findMany({
    where: {
      roomId: null,
      OR: [
        { fromUserId: user1, toUserId: user2 },
        { fromUserId: user2, toUserId: user1 },
      ],
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * When the recipient opens / refreshes history, mark sender→recipient messages as delivered.
 * Returns message ids so we can notify the sender (read ticks).
 */
export async function markIncomingDeliveredOnFetch(viewerId, peerId) {
  const pending = await prisma.message.findMany({
    where: {
      fromUserId: peerId,
      toUserId: viewerId,
      roomId: null,
      deliveryStatus: "sent",
    },
    select: { id: true },
  });
  if (pending.length === 0) {
    return { messageIds: [], notifyUserId: peerId };
  }
  const ids = pending.map((p) => p.id);
  await prisma.message.updateMany({
    where: { id: { in: ids } },
    data: { deliveryStatus: "delivered" },
  });
  return { messageIds: ids, notifyUserId: peerId };
}

/** Recipient acknowledges a pushed message (socket). */
export async function markMessageDeliveredByRecipient(messageId, recipientId) {
  const msg = await prisma.message.findFirst({
    where: {
      id: Number(messageId),
      toUserId: recipientId,
      roomId: null,
      deliveryStatus: "sent",
    },
  });
  if (!msg) {
    return prisma.message.findFirst({
      where: { id: Number(messageId), toUserId: recipientId, roomId: null },
    });
  }
  return prisma.message.update({
    where: { id: msg.id },
    data: { deliveryStatus: "delivered" },
  });
}

/**
 * Viewer (recipient) read peer's messages — marks peer→viewer as read.
 * Notifies original sender (peer) via socket.
 */
export async function markConversationRead(viewerId, peerId) {
  const r = await prisma.message.updateMany({
    where: {
      fromUserId: peerId,
      toUserId: viewerId,
      roomId: null,
      deliveryStatus: { in: ["sent", "delivered"] },
    },
    data: { deliveryStatus: "read" },
  });
  return r.count;
}

export async function getMessageForUser(messageId, userId) {
  return prisma.message.findFirst({
    where: {
      id: messageId,
      roomId: null,
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
  });
}

export async function getVoiceFilePath(messageId) {
  const dir = await fs.readdir(VOICE_DIR).catch(() => []);
  const base = String(messageId);
  const name = dir.find((f) => f.startsWith(`${base}.`));
  return name ? path.join(VOICE_DIR, name) : null;
}

export async function createVoiceMessage({ senderId, receiverId, buffer, mimeType }) {
  if (!buffer || buffer.length > MAX_VOICE_BYTES) {
    throw new Error("Voice note too large (max 2 MB)");
  }
  await ensureVoiceDir();
  const ext =
    mimeType?.includes("webm")
      ? "webm"
      : mimeType?.includes("mp4")
        ? "m4a"
        : mimeType?.includes("ogg")
          ? "ogg"
          : "webm";

  const msg = await prisma.message.create({
    data: {
      fromUserId: senderId,
      toUserId: receiverId,
      type: "voice",
      content: `__voice_pending__`,
      deliveryStatus: "sent",
    },
  });

  const filename = `${msg.id}.${ext}`;
  const filePath = path.join(VOICE_DIR, filename);
  await fs.writeFile(filePath, buffer);

  const publicPath = `/api/messages/media/${msg.id}`;
  return prisma.message.update({
    where: { id: msg.id },
    data: { content: publicPath },
  });
}

export async function sendRoomMessage({ senderId, roomId, content, type }) {
  return prisma.message.create({
    data: {
      fromUserId: senderId,
      roomId,
      content,
      type,
      deliveryStatus: "sent",
    },
  });
}

export async function getRoomMessages(roomId) {
  return prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
  });
}

/** True if user has any 1:1 (non-room) message as sender or receiver */
export async function userHasPeerChats(userId) {
  const count = await prisma.message.count({
    where: {
      roomId: null,
      OR: [{ fromUserId: userId }, { toUserId: userId }],
    },
  });
  return count > 0;
}

/**
 * WhatsApp-style inbox: one row per peer, last preview, time, unread count.
 */
export async function getConversationsForUser(userId) {
  const messages = await prisma.message.findMany({
    where: {
      roomId: null,
      OR: [
        { fromUserId: userId, toUserId: { not: null } },
        { toUserId: userId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: {
      id: true,
      fromUserId: true,
      toUserId: true,
      type: true,
      content: true,
      createdAt: true,
    },
  });

  const peerMap = new Map();
  for (const m of messages) {
    const peer = m.fromUserId === userId ? m.toUserId : m.fromUserId;
    if (!peer) continue;
    if (!peerMap.has(peer)) {
      const preview =
        m.type === "voice"
          ? "Voice message"
          : m.type === "voice_room_invite"
            ? "Voice room invite"
            : String(m.content || "").slice(0, 120);
      peerMap.set(peer, {
        peerId: peer,
        lastMessageAt: m.createdAt.toISOString(),
        lastPreview: preview,
      });
    }
  }

  const peerIds = [...peerMap.keys()];
  if (peerIds.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: peerIds } },
    select: { id: true, name: true, phone: true },
  });
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));

  const unreadRows = await prisma.message.findMany({
    where: {
      roomId: null,
      toUserId: userId,
      deliveryStatus: { in: ["sent", "delivered"] },
    },
    select: { fromUserId: true },
  });
  const unreadByPeer = {};
  for (const r of unreadRows) {
    unreadByPeer[r.fromUserId] = (unreadByPeer[r.fromUserId] || 0) + 1;
  }

  const list = peerIds.map((pid) => {
    const meta = peerMap.get(pid);
    const u = userById[pid];
    return {
      peerId: pid,
      name: u?.name || `User ${pid}`,
      phone: u?.phone || null,
      lastMessageAt: meta.lastMessageAt,
      lastPreview: meta.lastPreview,
      unread: unreadByPeer[pid] || 0,
    };
  });

  list.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  return list;
}
