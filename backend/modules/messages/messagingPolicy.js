import { prisma } from "../../prisma/client.js";
import {
  getWhoCanMessageRule,
  getWhoCanSendRoomInvitesRule,
} from "../users/userPreferencesSchema.js";
import { assertNotBlockedPair } from "../users/userBlockService.js";

/**
 * Any prior 1:1 message between the two users (either direction).
 */
export async function hasPriorDirectThread(userIdA, userIdB) {
  const n = await prisma.message.count({
    where: {
      roomId: null,
      OR: [
        { fromUserId: userIdA, toUserId: userIdB },
        { fromUserId: userIdB, toUserId: userIdA },
      ],
    },
  });
  return n > 0;
}

/**
 * @throws {Error} with user-facing message when send is not allowed
 */
export async function assertCanSendDirectMessage(senderId, receiverId) {
  const rid = Number(receiverId);
  const sid = Number(senderId);
  if (!Number.isFinite(rid) || rid < 1) throw new Error("Invalid recipient");
  if (sid === rid) throw new Error("Invalid recipient");

  await assertNotBlockedPair(sid, rid);

  const receiver = await prisma.user.findUnique({
    where: { id: rid },
    select: { id: true, preferences: true },
  });
  if (!receiver) throw new Error("Recipient not found");

  const rule = getWhoCanMessageRule(receiver.preferences);
  if (rule === "nobody") {
    throw new Error("This person is not accepting messages right now.");
  }
  if (rule === "contacts") {
    const ok = await hasPriorDirectThread(sid, rid);
    if (!ok) {
      throw new Error(
        "This person only accepts messages from existing chats. Ask them to message you first, or they can set “Who can message me” to Everyone in Settings."
      );
    }
  }
}

/**
 * Recipient’s Security → “Voice room invites” (DM payload type `voice_room_invite`).
 * Requires passing {@link assertCanSendDirectMessage} first when the invite is sent as a normal 1:1 message.
 *
 * @throws {Error} with user-facing message when invite is not allowed
 */
export async function assertCanSendVoiceRoomInvite(senderId, receiverId) {
  const rid = Number(receiverId);
  const sid = Number(senderId);
  if (!Number.isFinite(rid) || rid < 1) throw new Error("Invalid recipient");
  if (sid === rid) throw new Error("Invalid recipient");

  const receiver = await prisma.user.findUnique({
    where: { id: rid },
    select: { id: true, preferences: true },
  });
  if (!receiver) throw new Error("Recipient not found");

  const rule = getWhoCanSendRoomInvitesRule(receiver.preferences);
  if (rule === "nobody") {
    throw new Error("This person is not accepting voice room invites right now.");
  }
  if (rule === "contacts") {
    const ok = await hasPriorDirectThread(sid, rid);
    if (!ok) {
      throw new Error(
        "This person only accepts voice room invites from existing chats. Message them first, or they can set “Voice room invites” to Everyone in Settings."
      );
    }
  }
}

/**
 * @param {unknown} raw
 * @returns {{ roomId: string, name?: string }}
 */
export function parseVoiceRoomInvitePayload(raw) {
  let obj;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      throw new Error("Invalid room invite");
    }
  } else if (raw && typeof raw === "object") {
    obj = raw;
  } else {
    throw new Error("Invalid room invite");
  }
  const roomId = obj && typeof obj.roomId === "string" ? obj.roomId.trim() : "";
  if (!roomId || roomId.length > 80) throw new Error("Invalid room invite");
  const name = obj && typeof obj.name === "string" ? obj.name.trim().slice(0, 120) : undefined;
  return { roomId, name };
}
