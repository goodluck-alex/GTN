import { prisma } from "../../prisma/client.js";
import { parsePagination } from "./adminPagination.js";
import { recordAdminAudit } from "./adminAuditService.js";

const userListSelect = {
  id: true,
  subscriberId: true,
  name: true,
  email: true,
  phone: true,
  freeMinutes: true,
  currentPlanId: true,
  planExpiry: true,
  createdAt: true,
  lastDailyMinutesAt: true,
  tokenVersion: true,
  signupDeviceKey: true,
  signupIpHash: true,
};

function buildUserSearchWhere(q) {
  const trimmed = String(q || "").trim();
  if (!trimmed) return {};
  const OR = [];
  const num = /^\d+$/.test(trimmed) ? parseInt(trimmed, 10) : NaN;
  if (Number.isFinite(num)) {
    OR.push({ subscriberId: num });
    OR.push({ id: num });
  }
  OR.push({ phone: { contains: trimmed, mode: "insensitive" } });
  OR.push({ email: { contains: trimmed, mode: "insensitive" } });
  return { OR };
}

function serializeUser(u) {
  if (!u) return null;
  return {
    ...u,
    planExpiry: u.planExpiry ? u.planExpiry.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    lastDailyMinutesAt: u.lastDailyMinutesAt ? u.lastDailyMinutesAt.toISOString() : null,
  };
}

export async function listAdminUsers(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req);
    const q = req.query.q;
    const where = buildUserSearchWhere(q);

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userListSelect,
        orderBy: { id: "desc" },
        skip,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      ok: true,
      data: rows.map(serializeUser),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("listAdminUsers", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list users" });
  }
}

export async function getAdminUser(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid user id" });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: userListSelect,
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const [paymentsCount, referralsAsReferrer, subscriptionCount] = await Promise.all([
      prisma.payment.count({ where: { userId: id } }),
      prisma.referral.count({ where: { referrerId: id } }),
      prisma.subscription.count({ where: { userId: id } }),
    ]);

    res.json({
      ok: true,
      data: {
        user: serializeUser(user),
        counts: {
          payments: paymentsCount,
          referralsMade: referralsAsReferrer,
          subscriptions: subscriptionCount,
        },
      },
    });
  } catch (err) {
    console.error("getAdminUser", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to load user" });
  }
}

function userAuditSnapshot(u) {
  if (!u) return null;
  return {
    id: u.id,
    subscriberId: u.subscriberId,
    freeMinutes: u.freeMinutes,
    currentPlanId: u.currentPlanId,
    planExpiry: u.planExpiry ? u.planExpiry.toISOString() : null,
    tokenVersion: u.tokenVersion,
  };
}

export async function patchAdminUser(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid user id" });
    }

    const before = await prisma.user.findUnique({ where: { id }, select: userListSelect });
    if (!before) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    const body = req.body || {};
    const data = {};

    if (body.freeMinutes !== undefined) {
      const n = Number(body.freeMinutes);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ ok: false, error: "freeMinutes must be a non-negative number" });
      }
      data.freeMinutes = n;
    }

    if (body.currentPlanId !== undefined) {
      const pid = String(body.currentPlanId || "").trim();
      data.currentPlanId = pid || null;
    }

    if (body.planExpiry !== undefined) {
      if (body.planExpiry === null || body.planExpiry === "") {
        data.planExpiry = null;
      } else {
        const d = new Date(body.planExpiry);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ ok: false, error: "Invalid planExpiry (use ISO date or null)" });
        }
        data.planExpiry = d;
      }
    }

    if (body.bumpTokenVersion === true) {
      data.tokenVersion = { increment: 1 };
    } else if (body.tokenVersion !== undefined) {
      const tv = parseInt(String(body.tokenVersion), 10);
      if (!Number.isFinite(tv) || tv < 0) {
        return res.status(400).json({ ok: false, error: "tokenVersion must be a non-negative integer" });
      }
      if (tv < (before.tokenVersion ?? 0)) {
        return res.status(400).json({ ok: false, error: "tokenVersion cannot decrease" });
      }
      data.tokenVersion = tv;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Provide freeMinutes, currentPlanId, planExpiry, tokenVersion, and/or bumpTokenVersion",
      });
    }

    await prisma.user.update({ where: { id }, data });

    const after = await prisma.user.findUnique({ where: { id }, select: userListSelect });

    await recordAdminAudit(req.admin.id, {
      action: "user.patch",
      entity: "user",
      entityId: String(id),
      payload: {
        before: userAuditSnapshot(before),
        after: userAuditSnapshot(after),
        requestBody: body,
      },
      req,
    });

    res.json({ ok: true, data: { user: serializeUser(after) } });
  } catch (err) {
    console.error("patchAdminUser", err);
    res.status(500).json({ ok: false, error: err?.message || "Update failed" });
  }
}
