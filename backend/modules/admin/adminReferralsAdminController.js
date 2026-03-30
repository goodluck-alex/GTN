import { prisma } from "../../prisma/client.js";
import * as referralService from "../referrals/referralService.js";
import { recordAdminAudit } from "./adminAuditService.js";

function serializeReferral(r) {
  if (!r) return null;
  return {
    id: r.id,
    referrerId: r.referrerId,
    referredUserId: r.referredUserId,
    referredName: r.referredName,
    status: r.status,
    bonusMinutes: r.bonusMinutes,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
    completionTrigger: r.completionTrigger,
  };
}

export async function patchAdminReferral(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid referral id" });
    }

    const status = String(req.body?.status || "").trim().toLowerCase();
    if (status !== "cancelled") {
      return res.status(400).json({
        ok: false,
        error: 'Only { "status": "cancelled" } is supported (non-completed referrals only)',
      });
    }

    const before = await prisma.referral.findUnique({ where: { id } });
    if (!before) {
      return res.status(404).json({ ok: false, error: "Referral not found" });
    }

    const row = await referralService.adminCancelReferralById(id);

    await recordAdminAudit(req.admin.id, {
      action: "referral.cancel",
      entity: "referral",
      entityId: String(id),
      payload: { before: serializeReferral(before), after: serializeReferral(row), requestBody: req.body },
      req,
    });

    res.json({ ok: true, data: serializeReferral(row) });
  } catch (err) {
    const msg = err?.message || "Update failed";
    if (/cannot cancel|not found|Invalid/i.test(msg)) {
      return res.status(400).json({ ok: false, error: msg });
    }
    console.error("patchAdminReferral", err);
    res.status(500).json({ ok: false, error: msg });
  }
}

export async function postAdminReferralCompleteReward(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Invalid referral id" });
    }

    const before = await prisma.referral.findUnique({ where: { id } });
    if (!before) {
      return res.status(404).json({ ok: false, error: "Referral not found" });
    }

    const row = await referralService.adminCompleteReferralById(id);

    await recordAdminAudit(req.admin.id, {
      action: "referral.complete_reward",
      entity: "referral",
      entityId: String(id),
      payload: { before: serializeReferral(before), after: serializeReferral(row) },
      req,
    });

    res.json({ ok: true, data: serializeReferral(row) });
  } catch (err) {
    const msg = err?.message || "Complete failed";
    if (/not found|Only verified|Invalid/i.test(msg)) {
      return res.status(400).json({ ok: false, error: msg });
    }
    console.error("postAdminReferralCompleteReward", err);
    res.status(500).json({ ok: false, error: msg });
  }
}
