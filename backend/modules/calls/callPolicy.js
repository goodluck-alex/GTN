import { prisma } from "../../prisma/client.js";
import { getWhoCanCallRule } from "../users/userPreferencesSchema.js";
import { hasPriorDirectThread } from "../messages/messagingPolicy.js";
import { assertNotBlockedPair } from "../users/userBlockService.js";

/**
 * Enforce callee’s `security.whoCanCall` for in-app GTN users (has a User row).
 * Off-network numbers (no User) are not restricted here.
 *
 * @param {number} callerUserId
 * @param {number | null | undefined} receiverUserId
 */
export async function assertCanPlaceVoiceCall(callerUserId, receiverUserId) {
  if (receiverUserId == null) return;
  const rid = Number(receiverUserId);
  const cid = Number(callerUserId);
  if (!Number.isFinite(rid) || rid < 1) return;
  if (cid === rid) return;

  await assertNotBlockedPair(cid, rid);

  const receiver = await prisma.user.findUnique({
    where: { id: rid },
    select: { preferences: true },
  });
  if (!receiver) return;

  const rule = getWhoCanCallRule(receiver.preferences);
  if (rule === "nobody") {
    throw new Error("This person is not accepting calls right now.");
  }
  if (rule === "contacts") {
    const ok = await hasPriorDirectThread(cid, rid);
    if (!ok) {
      throw new Error(
        "This person only accepts calls after you have a chat history. Send a message first, or they can set “Who can call me” to Everyone in Settings."
      );
    }
  }
}
