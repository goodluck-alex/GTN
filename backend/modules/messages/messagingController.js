import * as messagingService from "./messagingService.js";
import * as referralService from "../referrals/referralService.js";
import { getSocketIo } from "../../socket/ioInstance.js";
import { prisma } from "../../prisma/client.js";
import {
  assertCanSendDirectMessage,
  assertCanSendVoiceRoomInvite,
  parseVoiceRoomInvitePayload,
} from "./messagingPolicy.js";
import { isReadReceiptsEnabled } from "../users/userPreferencesSchema.js";
import fs from "fs/promises";
import path from "path";

function emitToUser(userId, event, payload) {
  const io = getSocketIo();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

export async function send(req, res) {
  try {
    const { receiverId, type, content } = req.body;
    const msgType = String(type || "text");

    await assertCanSendDirectMessage(req.user.id, receiverId);

    let bodyContent = content;
    if (msgType === "voice_room_invite") {
      await assertCanSendVoiceRoomInvite(req.user.id, receiverId);
      const payload = parseVoiceRoomInvitePayload(content);
      const room = await prisma.voiceRoom.findUnique({ where: { id: payload.roomId } });
      if (!room || room.status !== "active") {
        return res.status(400).json({ message: "That voice room is not available." });
      }
      const inRoom =
        room.createdBy === req.user.id ||
        (await prisma.voiceRoomParticipant.findFirst({
          where: { roomId: room.id, userId: req.user.id, leftAt: null },
        }));
      if (!inRoom) {
        return res.status(400).json({ message: "Join the room before inviting someone." });
      }
      bodyContent = JSON.stringify({ roomId: payload.roomId, name: payload.name || "" });
    }

    const message = await messagingService.sendMessage({
      senderId: req.user.id,
      receiverId,
      type: msgType,
      content: bodyContent,
    });

    void referralService.tryCompleteReferralActivity(req.user.id, "first_message").catch(() => {});

    emitToUser(receiverId, "message:new", message);

    res.json(message);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

/** GET /messages/conversations — inbox list (peer, preview, unread) */
export async function getConversations(req, res) {
  try {
    const list = await messagingService.getConversationsForUser(req.user.id);
    res.json(list);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function getHistory(req, res) {
  try {
    const peerId = parseInt(req.query.peerId, 10);
    if (!peerId || Number.isNaN(peerId)) {
      return res.status(400).json({ message: "peerId required" });
    }
    const userId = req.user.id;

    const { messageIds, notifyUserId } = await messagingService.markIncomingDeliveredOnFetch(
      userId,
      peerId
    );

    const messages = await messagingService.getChatHistory(userId, peerId);

    for (const mid of messageIds) {
      emitToUser(notifyUserId, "message:status", {
        messageId: mid,
        deliveryStatus: "delivered",
      });
    }

    res.json(messages);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

/** Mark messages from peer → me as read (viewer opened chat). Notifies peer. */
export async function markRead(req, res) {
  try {
    const peerId = parseInt(req.body?.peerId, 10);
    if (!peerId) {
      return res.status(400).json({ message: "peerId required" });
    }
    const viewerId = req.user.id;
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { preferences: true },
    });
    if (!isReadReceiptsEnabled(viewer?.preferences)) {
      return res.json({ ok: true, count: 0, readReceiptsDisabled: true });
    }
    const count = await messagingService.markConversationRead(viewerId, peerId);
    if (count > 0) {
      emitToUser(peerId, "conversation:read", { peerId: viewerId });
    }
    res.json({ ok: true, count });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function sendVoice(req, res) {
  try {
    const receiverId = parseInt(req.body?.receiverId, 10);
    const mimeType = String(req.body?.mimeType || "audio/webm");
    const base64 = req.body?.audioBase64;
    if (!receiverId || !base64) {
      return res.status(400).json({ message: "receiverId and audioBase64 required" });
    }
    await assertCanSendDirectMessage(req.user.id, receiverId);
    const buffer = Buffer.from(base64, "base64");
    const message = await messagingService.createVoiceMessage({
      senderId: req.user.id,
      receiverId,
      buffer,
      mimeType,
    });
    void referralService.tryCompleteReferralActivity(req.user.id, "first_message").catch(() => {});
    emitToUser(receiverId, "message:new", message);
    res.json(message);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function getMedia(req, res) {
  try {
    const messageId = parseInt(req.params.messageId, 10);
    const userId = req.user.id;
    const msg = await messagingService.getMessageForUser(messageId, userId);
    if (!msg || msg.type !== "voice") {
      return res.status(404).json({ message: "Not found" });
    }
    const filePath = await messagingService.getVoiceFilePath(messageId);
    if (!filePath) {
      return res.status(404).json({ message: "File missing" });
    }
    const stat = await fs.stat(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime =
      ext === "webm"
        ? "audio/webm"
        : ext === "m4a" || ext === "mp4"
          ? "audio/mp4"
          : ext === "ogg"
            ? "audio/ogg"
            : "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const data = await fs.readFile(filePath);
    res.send(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function sendRoom(req, res) {
  try {
    const { roomId, type, content } = req.body;

    const message = await messagingService.sendRoomMessage({
      senderId: req.user.id,
      roomId,
      type,
      content,
    });

    res.json(message);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}

export async function getRoomMessages(req, res) {
  try {
    const { roomId } = req.query;

    const messages = await messagingService.getRoomMessages(roomId);

    res.json(messages);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
}
