import { listAdminAuditLogs } from "./adminAuditService.js";

export async function listAdminAuditLogsHandler(req, res) {
  try {
    const page = parseInt(String(req.query.page || "1"), 10) || 1;
    const limit = parseInt(String(req.query.limit || "30"), 10) || 30;
    const entity = req.query.entity;
    const entityId = req.query.entityId;

    const out = await listAdminAuditLogs({ entity, entityId, page, limit });
    res.json({ ok: true, ...out });
  } catch (err) {
    console.error("listAdminAuditLogsHandler", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list audit logs" });
  }
}
