import { z } from "zod";

/**
 * Allowed preference namespaces and fields (Phase A contract).
 * PATCH rejects unknown top-level keys; stored JSON may contain extra keys for forward compatibility.
 */

const audience = z.enum(["everyone", "contacts", "nobody"]);
const mediaDownload = z.enum(["wifi", "always", "never"]);
const callQuality = z.enum(["low", "medium", "high"]);

export const preferencesChatSchema = z
  .object({
    readReceiptsEnabled: z.boolean().optional(),
    typingIndicatorEnabled: z.boolean().optional(),
    mediaDownload: mediaDownload.optional(),
  })
  .strict();

export const preferencesVoiceSchema = z
  .object({
    callQuality: callQuality.optional(),
    muteOnCallStart: z.boolean().optional(),
    speakerDefault: z.boolean().optional(),
  })
  .strict();

export const preferencesRoomsSchema = z
  .object({
    roomAutoMute: z.boolean().optional(),
    whoCanInviteToRooms: audience.optional(),
    showActivityInRooms: z.boolean().optional(),
    roomNotifications: z.boolean().optional(),
  })
  .strict();

/** Server-enforced privacy (messages / calls / rooms) — wire in later phases */
export const preferencesSecuritySchema = z
  .object({
    whoCanCall: audience.optional(),
    whoCanMessage: audience.optional(),
    whoCanSendRoomInvites: audience.optional(),
  })
  .strict();

export const preferencesNotificationsSchema = z
  .object({
    calls: z.boolean().optional(),
    messages: z.boolean().optional(),
    voiceRoomInvites: z.boolean().optional(),
    referralRewards: z.boolean().optional(),
    planActivity: z.boolean().optional(),
    sound: z.boolean().optional(),
    vibration: z.boolean().optional(),
  })
  .strict();

export const preferencesAppearanceSchema = z
  .object({
    themeMode: z.enum(["dark", "light", "auto"]).optional(),
    fontSize: z.enum(["small", "medium", "large"]).optional(),
  })
  .strict();

export const preferencesDataSchema = z
  .object({
    dataSaver: z.boolean().optional(),
  })
  .strict();

/** Partial patch: only these top-level keys allowed; each nested object is strict */
export const preferencesPatchSchema = z
  .object({
    chat: preferencesChatSchema.optional(),
    voice: preferencesVoiceSchema.optional(),
    rooms: preferencesRoomsSchema.optional(),
    security: preferencesSecuritySchema.optional(),
    notifications: preferencesNotificationsSchema.optional(),
    appearance: preferencesAppearanceSchema.optional(),
    data: preferencesDataSchema.optional(),
  })
  .strict();

export const patchMeBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    bio: z.union([z.string().max(500), z.literal("")]).optional(),
    preferences: preferencesPatchSchema.optional(),
  })
  .strict();

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function preferencesFromDb(raw) {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  return /** @type {Record<string, unknown>} */ (raw);
}

/**
 * Deep-merge plain objects: keys only in `target` stay; nested objects merge.
 * Arrays and non-objects replace by value from `patch`.
 *
 * @param {Record<string, unknown>} target
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
export function deepMergePreferences(target, patch) {
  const out = { ...target };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const tv = out[key];
    if (
      pv !== null &&
      typeof pv === "object" &&
      !Array.isArray(pv) &&
      tv !== null &&
      typeof tv === "object" &&
      !Array.isArray(tv)
    ) {
      out[key] = deepMergePreferences(
        /** @type {Record<string, unknown>} */ (tv),
        /** @type {Record<string, unknown>} */ (pv)
      );
    } else {
      out[key] = pv;
    }
  }
  return out;
}

/** @param {unknown} preferencesRaw */
export function getWhoCanMessageRule(preferencesRaw) {
  const p = preferencesFromDb(preferencesRaw);
  const w = p.security && typeof p.security === "object" ? /** @type {Record<string, unknown>} */ (p.security).whoCanMessage : undefined;
  if (w === "everyone" || w === "contacts" || w === "nobody") return w;
  return "everyone";
}

/** @param {unknown} preferencesRaw */
export function getWhoCanCallRule(preferencesRaw) {
  const p = preferencesFromDb(preferencesRaw);
  const sec = p.security && typeof p.security === "object" ? /** @type {Record<string, unknown>} */ (p.security) : {};
  const w = sec.whoCanCall;
  if (w === "everyone" || w === "contacts" || w === "nobody") return w;
  return "everyone";
}

/** Settings → Voice Rooms → “Who can invite me” (joining others’ rooms). */
export function getWhoCanInviteToRoomsRule(preferencesRaw) {
  const p = preferencesFromDb(preferencesRaw);
  const rooms = p.rooms && typeof p.rooms === "object" ? /** @type {Record<string, unknown>} */ (p.rooms) : {};
  const w = rooms.whoCanInviteToRooms;
  if (w === "everyone" || w === "contacts" || w === "nobody") return w;
  return "everyone";
}

/** Settings → Security → “Voice room invites” (in-app DM invites to a room). */
export function getWhoCanSendRoomInvitesRule(preferencesRaw) {
  const p = preferencesFromDb(preferencesRaw);
  const sec = p.security && typeof p.security === "object" ? /** @type {Record<string, unknown>} */ (p.security) : {};
  const w = sec.whoCanSendRoomInvites;
  if (w === "everyone" || w === "contacts" || w === "nobody") return w;
  return "everyone";
}

/** @param {unknown} preferencesRaw */
export function isReadReceiptsEnabled(preferencesRaw) {
  const p = preferencesFromDb(preferencesRaw);
  const chat = p.chat && typeof p.chat === "object" ? /** @type {Record<string, unknown>} */ (p.chat) : {};
  return chat.readReceiptsEnabled !== false;
}

/** @param {unknown} preferencesRaw */
export function isTypingIndicatorEnabled(preferencesRaw) {
  const p = preferencesFromDb(preferencesRaw);
  const chat = p.chat && typeof p.chat === "object" ? /** @type {Record<string, unknown>} */ (p.chat) : {};
  return chat.typingIndicatorEnabled !== false;
}
