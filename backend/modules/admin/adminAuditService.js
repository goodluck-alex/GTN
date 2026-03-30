import { prisma } from "../../prisma/client.js";

function getClientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

export async function recordAdminAudit(adminUserId, { action, entity, entityId, payload, req }) {
  const ip = req ? getClientIp(req) : null;
  await prisma.adminAuditLog.create({
    data: {
      adminUserId,
      action,
      entity: entity ?? null,
      entityId: entityId != null ? String(entityId) : null,
      payload: payload === undefined ? undefined : payload,
      ip: ip || null,
    },
  });
}

export async function listAdminAuditLogs({ entity, entityId, page = 1, limit = 30 }) {
  const take = Math.min(100, Math.max(1, limit));
  const skip = (Math.max(1, page) - 1) * take;
  const where = {};
  if (entity) where.entity = String(entity).trim();
  if (entityId != null && String(entityId).trim() !== "") where.entityId = String(entityId).trim();

  const [rows, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        admin: { select: { id: true, email: true, name: true, role: true } },
      },
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return {
    data: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      payload: r.payload,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      admin: r.admin,
    })),
    page: Math.max(1, page),
    limit: take,
    total,
    totalPages: Math.ceil(total / take) || 1,
  };
}
