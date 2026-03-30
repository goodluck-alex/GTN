import jwt from "jsonwebtoken";
import { prisma } from "../prisma/client.js";
import * as messagingService from "../modules/messages/messagingService.js";
import { isTypingIndicatorEnabled } from "../modules/users/userPreferencesSchema.js";
import * as voiceRoomService from "../modules/voiceRooms/voiceRoomService.js";
import * as voiceRoomBilling from "../modules/voiceRooms/voiceRoomBillingService.js";
import { getSocketIo } from "./ioInstance.js";

function emitToUser(userId, event, payload) {
  const io = getSocketIo();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * Authenticated chat features + legacy unauthenticated connections (e.g. calls).
 */
function leaveVoiceRoom(socket, rid) {
  if (!rid) return;
  if (socket.userId != null) {
    voiceRoomBilling.unregisterSpeakingSession(rid, socket.userId);
  }
  try {
    socket.leave(`vr:${rid}`);
  } catch {
    /* ignore */
  }
  socket.gtnVoiceRoomId = undefined;
  socket.to(`vr:${rid}`).emit("voice_room:peer_left", { userId: socket.userId, roomId: rid });
}

/**
 * Community voice rooms: WebRTC mesh signaling (join/leave/signal relay).
 * Clients use simple-peer; server only routes by user id + room id.
 */
export function attachChatSocket(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      socket.userId = null;
      return next();
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, tokenVersion: true },
      });
      if (!user) return next(new Error("Unauthorized"));
      const tokenTv = Number(decoded.tv ?? 0);
      if (tokenTv !== (user.tokenVersion ?? 0)) return next(new Error("Unauthorized"));
      const jid = decoded.jti != null ? String(decoded.jti).trim() : "";
      if (jid) {
        const s = await prisma.userSession.findUnique({
          where: { jti: jid },
          select: { userId: true, revokedAt: true },
        });
        if (!s || s.userId !== user.id || s.revokedAt != null) return next(new Error("Unauthorized"));
      }
      socket.userId = user.id;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.userId != null) {
      socket.join(`user:${socket.userId}`);
    }

    socket.on("voice_room:join", async (roomId) => {
      if (socket.userId == null || !roomId) return;
      const rid = String(roomId).trim();
      if (!rid) return;
      if (socket.gtnVoiceRoomId && socket.gtnVoiceRoomId !== rid) {
        leaveVoiceRoom(socket, socket.gtnVoiceRoomId);
      }
      socket.join(`vr:${rid}`);
      socket.gtnVoiceRoomId = rid;
      try {
        const roomSockets = await io.in(`vr:${rid}`).fetchSockets();
        const otherIds = [
          ...new Set(
            roomSockets.map((s) => s.userId).filter((id) => id != null && id !== socket.userId)
          ),
        ];
        socket.emit("voice_room:peers", { userIds: otherIds, roomId: rid });
        socket.to(`vr:${rid}`).emit("voice_room:peer_joined", { userId: socket.userId, roomId: rid });
      } catch (e) {
        console.error("voice_room:join", e);
      }
    });

    socket.on("voice_room:leave", (roomId) => {
      if (socket.userId == null || !roomId) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      leaveVoiceRoom(socket, rid);
    });

    socket.on("voice_room:signal", ({ roomId, toUserId, signal }) => {
      if (socket.userId == null || roomId == null || toUserId == null || signal == null) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      emitToUser(Number(toUserId), "voice_room:signal", {
        fromUserId: socket.userId,
        signal,
        roomId: rid,
      });
    });

    socket.on("voice_room:speaking_start", async (roomId) => {
      if (socket.userId == null || !roomId) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      try {
        await voiceRoomBilling.registerSpeakingSession(rid, socket.userId);
        socket.emit("voice_room:speaking_ok", { roomId: rid });
      } catch (e) {
        socket.emit("voice_room:speaking_denied", { error: e.message || "denied", code: e.code });
      }
    });

    socket.on("voice_room:speaking_stop", (roomId) => {
      if (socket.userId == null || !roomId) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      voiceRoomBilling.unregisterSpeakingSession(rid, socket.userId);
    });

    socket.on("voice_room:speaking_tick", async ({ roomId, minuteIndex }) => {
      if (socket.userId == null || roomId == null || minuteIndex == null) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      try {
        const mi = parseInt(minuteIndex, 10);
        const result = await voiceRoomBilling.processSpeakingTick(rid, socket.userId, mi);
        if (!result.ok) {
          socket.emit("voice_room:billing_failed", result);
          return;
        }
        socket.emit("voice_room:billing_ok", result);
      } catch (e) {
        console.error("voice_room:speaking_tick", e);
        socket.emit("voice_room:billing_failed", { error: e.message || "billing_error" });
      }
    });

    socket.on("voice_room:chat", async ({ roomId, content }) => {
      if (socket.userId == null || !roomId) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      try {
        const msg = await voiceRoomService.postMessage(rid, socket.userId, content);
        const io = getSocketIo();
        io?.to(`vr:${rid}`).emit("voice_room:chat_message", {
          ...msg,
          senderId: socket.userId,
        });
      } catch (e) {
        socket.emit("voice_room:chat_error", { error: e.message || "send_failed" });
      }
    });

    socket.on("voice_room:reaction", async ({ roomId, emoji, targetUserId }) => {
      if (socket.userId == null || !roomId) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      try {
        const r = await voiceRoomService.postReaction(rid, socket.userId, emoji, targetUserId);
        const io = getSocketIo();
        io?.to(`vr:${rid}`).emit("voice_room:reaction_event", {
          ...r,
          userId: socket.userId,
        });
      } catch (e) {
        socket.emit("voice_room:reaction_error", { error: e.message || "failed" });
      }
    });

    socket.on("voice_room:typing", ({ roomId, typing }) => {
      if (socket.userId == null || !roomId) return;
      const rid = String(roomId).trim();
      if (socket.gtnVoiceRoomId !== rid) return;
      socket.to(`vr:${rid}`).emit("voice_room:typing_event", {
        roomId: rid,
        userId: socket.userId,
        typing: Boolean(typing),
      });
    });

    socket.on("disconnect", () => {
      if (socket.gtnVoiceRoomId) {
        const rid = socket.gtnVoiceRoomId;
        if (socket.userId != null) {
          voiceRoomBilling.unregisterSpeakingSession(rid, socket.userId);
        }
        socket.to(`vr:${rid}`).emit("voice_room:peer_left", { userId: socket.userId, roomId: rid });
        socket.gtnVoiceRoomId = undefined;
      }
    });

    socket.on("typing", async ({ peerId, typing }) => {
      if (socket.userId == null || !peerId) return;
      const pid = Number(peerId);
      if (!Number.isFinite(pid) || pid < 1) return;
      try {
        const [senderRow, recipientRow] = await Promise.all([
          prisma.user.findUnique({
            where: { id: socket.userId },
            select: { preferences: true },
          }),
          prisma.user.findUnique({
            where: { id: pid },
            select: { preferences: true },
          }),
        ]);
        if (!isTypingIndicatorEnabled(senderRow?.preferences)) return;
        if (!isTypingIndicatorEnabled(recipientRow?.preferences)) return;
        emitToUser(pid, "typing", {
          peerId: socket.userId,
          typing: Boolean(typing),
        });
      } catch (e) {
        console.error("typing relay", e);
      }
    });

    socket.on("message:delivered", async ({ messageId }) => {
      if (socket.userId == null || !messageId) return;
      try {
        const msg = await messagingService.markMessageDeliveredByRecipient(messageId, socket.userId);
        if (msg?.fromUserId && msg.deliveryStatus === "delivered") {
          emitToUser(msg.fromUserId, "message:status", {
            messageId: msg.id,
            deliveryStatus: msg.deliveryStatus,
          });
        }
      } catch (e) {
        console.error("message:delivered", e);
      }
    });
  });
}
