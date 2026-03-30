import { prisma } from "../../prisma/client.js";
import { parsePagination } from "./adminPagination.js";

export async function listAdminReferrals(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req);
    const status = String(req.query.status || "").trim();
    const refSubscriberIdRaw = req.query.refSubscriberId;

    const where = {};
    if (status) where.status = status;
    if (refSubscriberIdRaw != null && String(refSubscriberIdRaw).trim() !== "") {
      const refSubscriberId = parseInt(String(refSubscriberIdRaw), 10);
      if (Number.isFinite(refSubscriberId)) {
        const referrer = await prisma.user.findFirst({
          where: { subscriberId: refSubscriberId },
          select: { id: true },
        });
        if (referrer) where.referrerId = referrer.id;
        else where.referrerId = -1;
      }
    }

    const [rows, total] = await Promise.all([
      prisma.referral.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          referrer: {
            select: { id: true, subscriberId: true, name: true, phone: true },
          },
          referredUser: {
            select: { id: true, subscriberId: true, name: true, phone: true },
          },
        },
      }),
      prisma.referral.count({ where }),
    ]);

    res.json({
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        referrerId: r.referrerId,
        referredUserId: r.referredUserId,
        referredName: r.referredName,
        bonusMinutes: r.bonusMinutes,
        referredBonusMinutes: r.referredBonusMinutes,
        status: r.status,
        source: r.source,
        sourceMeta: r.sourceMeta,
        clickedAt: r.clickedAt ? r.clickedAt.toISOString() : null,
        verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
        completionTrigger: r.completionTrigger,
        createdAt: r.createdAt.toISOString(),
        referrer: r.referrer,
        referredUser: r.referredUser,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("listAdminReferrals", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list referrals" });
  }
}
