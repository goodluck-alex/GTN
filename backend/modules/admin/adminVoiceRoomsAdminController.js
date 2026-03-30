import { prisma } from "../../prisma/client.js";
import * as voiceRoomService from "../voiceRooms/voiceRoomService.js";
import { recordAdminAudit } from "./adminAuditService.js";

export async function postAdminVoiceRoomEnd(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "room id is required" });
    }

    const before = await prisma.voiceRoom.findUnique({ where: { id } });
    if (!before) {
      return res.status(404).json({ ok: false, error: "Room not found" });
    }

    const row = await voiceRoomService.adminEndVoiceRoom(id);

    await recordAdminAudit(req.admin.id, {
      action: "voice_room.end",
      entity: "voice_room",
      entityId: id,
      payload: {
        beforeStatus: before.status,
        afterStatus: row.status,
        endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      },
      req,
    });

    res.json({
      ok: true,
      data: {
        id: row.id,
        name: row.name,
        status: row.status,
        endedAt: row.endedAt ? row.endedAt.toISOString() : null,
      },
    });
  } catch (err) {
    const msg = err?.message || "End room failed";
    if (/not active|not found/i.test(msg)) {
      return res.status(400).json({ ok: false, error: msg });
    }
    console.error("postAdminVoiceRoomEnd", err);
    res.status(500).json({ ok: false, error: msg });
  }
}
