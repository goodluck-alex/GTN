import { prisma } from "../../prisma/client.js";
import { parsePagination } from "./adminPagination.js";

export async function listAdminSubscriptions(req, res) {
  try {
    const userIdRaw = req.query.userId;
    const userId = parseInt(String(userIdRaw || ""), 10);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ ok: false, error: "userId query parameter is required" });
    }

    const { page, limit, skip } = parsePagination(req);

    const where = { userId };

    const [rows, total] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          plan: { select: { id: true, name: true, price: true } },
          payment: { select: { id: true, status: true, provider: true } },
        },
        orderBy: { startTime: "desc" },
        skip,
        take: limit,
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json({
      ok: true,
      data: rows.map((s) => ({
        id: s.id,
        userId: s.userId,
        planId: s.planId,
        paymentId: s.paymentId,
        startTime: s.startTime.toISOString(),
        expiryTime: s.expiryTime ? s.expiryTime.toISOString() : null,
        status: s.status,
        plan: s.plan,
        payment: s.payment,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("listAdminSubscriptions", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list subscriptions" });
  }
}
