import { prisma } from "../../prisma/client.js";
import { normalizePhoneE164 } from "../auth/authService.js";
import { getPeerIdsInBlockRelationWith } from "./userBlockService.js";

export async function getUserById(userId) {
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function getAllUsers() {
  return prisma.user.findMany();
}

/**
 * Find GTN members by exact E.164 phone and/or subscriber ID (for messaging dialer).
 * Excludes the current user. Does not return passwords.
 */
export async function searchContactsForUser(query, excludeUserId) {
  const raw = String(query || "").trim();
  if (raw.length < 4) return [];

  const digits = raw.replace(/\D/g, "");
  const orConditions = [];

  if (raw.startsWith("+") || digits.length >= 8) {
    try {
      const phone = normalizePhoneE164(raw.startsWith("+") ? raw : `+${digits}`);
      orConditions.push({ phone });
    } catch {
      /* invalid */
    }
  }

  if (/^\d+$/.test(digits) && digits.length >= 6 && digits.length <= 15) {
    const sid = parseInt(digits, 10);
    if (Number.isFinite(sid)) orConditions.push({ subscriberId: sid });
  }

  if (orConditions.length === 0) return [];

  const blockedPeers = await getPeerIdsInBlockRelationWith(excludeUserId);

  const users = await prisma.user.findMany({
    where: {
      AND: [{ OR: orConditions }, { id: { not: excludeUserId } }],
    },
    select: { id: true, name: true, phone: true, subscriberId: true },
    take: 10,
  });

  return users.filter((u) => !blockedPeers.has(u.id));
}

/**
 * Match address-book entries to GTN users by normalized E.164 phone.
 * `entries`: `{ phone: string, name?: string }[]` (phone can include tel: or spaces).
 */
export async function matchContactsForUser(entries, excludeUserId) {
  const normalized = [];
  for (const e of entries) {
    const raw = typeof e === "string" ? e : e?.phone;
    if (!raw) continue;
    let clean = String(raw).trim();
    if (clean.toLowerCase().startsWith("tel:")) clean = clean.slice(4).trim();
    clean = clean.replace(/\s/g, "");
    try {
      const phone = normalizePhoneE164(clean);
      const name =
        typeof e === "object" && e?.name != null ? String(e.name).trim() : "";
      normalized.push({ phone, name });
    } catch {
      /* skip invalid */
    }
  }

  const dedup = [...new Map(normalized.map((x) => [x.phone, x])).values()];
  const phones = dedup.map((x) => x.phone);
  if (phones.length === 0) {
    return { onGtn: [], notOnGtn: [] };
  }

  const blockedPeers = await getPeerIdsInBlockRelationWith(excludeUserId);

  const onUsersRaw = await prisma.user.findMany({
    where: {
      phone: { in: phones },
      id: { not: excludeUserId },
    },
    select: { id: true, name: true, phone: true, subscriberId: true },
  });

  const onUsers = onUsersRaw.filter((u) => !blockedPeers.has(u.id));

  const onSet = new Set(onUsers.map((u) => u.phone));
  const notOnGtn = dedup.filter((x) => !onSet.has(x.phone));

  return { onGtn: onUsers, notOnGtn };
}