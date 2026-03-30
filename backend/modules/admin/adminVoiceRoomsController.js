import { prisma } from "../../prisma/client.js";
import { parsePagination } from "./adminPagination.js";

export async function listAdminVoiceRooms(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req);

    const [rows, total] = await Promise.all([
      prisma.voiceRoom.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          host: {
            select: {
              id: true,
              subscriberId: true,
              name: true,
              phone: true,
              email: true,
            },
          },
          _count: { select: { participants: true } },
        },
      }),
      prisma.voiceRoom.count(),
    ]);

    res.json({
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        createdBy: r.createdBy,
        privacy: r.privacy,
        maxParticipants: r.maxParticipants,
        status: r.status,
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        host: r.host,
        participantCount: r._count.participants,
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("listAdminVoiceRooms", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list voice rooms" });
  }
}
