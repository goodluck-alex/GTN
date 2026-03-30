import { prisma } from "../../prisma/client.js";

export async function getAdminOverview(req, res) {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      usersTotal,
      usersNew7d,
      paymentsPending,
      paymentsFailed24h,
      paymentsSucceeded7d,
      activeVoiceRooms,
      auditEntries24h,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.payment.count({ where: { status: { in: ["created", "pending"] } } }),
      prisma.payment.count({ where: { status: "failed", updatedAt: { gte: dayAgo } } }),
      prisma.payment.count({ where: { status: "succeeded", updatedAt: { gte: weekAgo } } }),
      prisma.voiceRoom.count({ where: { status: "active" } }),
      prisma.adminAuditLog.count({ where: { createdAt: { gte: dayAgo } } }),
    ]);

    res.json({
      ok: true,
      data: {
        users: { total: usersTotal, newLast7Days: usersNew7d },
        payments: {
          pending: paymentsPending,
          failedLast24Hours: paymentsFailed24h,
          succeededLast7Days: paymentsSucceeded7d,
        },
        voiceRooms: { active: activeVoiceRooms },
        audit: { entriesLast24Hours: auditEntries24h },
      },
    });
  } catch (err) {
    console.error("getAdminOverview", err);
    res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load overview",
      code: "OVERVIEW_FAILED",
    });
  }
}
