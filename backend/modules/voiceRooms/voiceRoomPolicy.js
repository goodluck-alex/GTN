import { prisma } from "../../prisma/client.js";
import { getWhoCanInviteToRoomsRule } from "../users/userPreferencesSchema.js";
import { hasPriorDirectThread } from "../messages/messagingPolicy.js";
import { assertNotBlockedPair } from "../users/userBlockService.js";

/**
 * Joiner’s `rooms.whoCanInviteToRooms`: joining **another user’s** active room.
 * Host re-joining own room is always allowed.
 *
 * @param {number} joinerUserId
 * @param {number} hostUserId room.createdBy
 */
export async function assertCanJoinOthersVoiceRoom(joinerUserId, hostUserId) {
  if (joinerUserId === hostUserId) return;

  await assertNotBlockedPair(joinerUserId, hostUserId);

  const joiner = await prisma.user.findUnique({
    where: { id: joinerUserId },
    select: { preferences: true },
  });

  const rule = getWhoCanInviteToRoomsRule(joiner?.preferences);
  if (rule === "nobody") {
    throw new Error(
      "Your settings only allow rooms you create. Change “Who can invite me” under Voice Rooms in Settings to join others."
    );
  }
  if (rule === "contacts") {
    const ok = await hasPriorDirectThread(joinerUserId, hostUserId);
    if (!ok) {
      throw new Error(
        "You only join others’ rooms after you have chatted with the host. Message them first, or set “Who can invite me” to Everyone."
      );
    }
  }
}
