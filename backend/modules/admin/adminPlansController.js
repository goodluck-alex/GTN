import { prisma } from "../../prisma/client.js";
import { recordAdminAudit } from "./adminAuditService.js";

function planSnapshot(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    durationDays: p.durationDays,
    unlimitedCalls: p.unlimitedCalls,
    dailyFreeMinutes: p.dailyFreeMinutes,
    active: p.active,
  };
}

export async function listAdminPlans(req, res) {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: [{ active: "desc" }, { price: "asc" }],
    });

    res.json({
      ok: true,
      data: plans.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        durationDays: p.durationDays,
        unlimitedCalls: p.unlimitedCalls,
        dailyFreeMinutes: p.dailyFreeMinutes,
        active: p.active,
      })),
    });
  } catch (err) {
    console.error("listAdminPlans", err);
    res.status(500).json({ ok: false, error: err?.message || "Failed to list plans" });
  }
}

export async function createAdminPlan(req, res) {
  try {
    const b = req.body || {};
    const id = String(b.id || "").trim();
    const name = String(b.name || "").trim();
    if (!id || !/^[a-z0-9_-]{1,64}$/i.test(id)) {
      return res.status(400).json({ ok: false, error: "id is required (alphanumeric, dash, underscore)" });
    }
    if (!name) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    const price = Number(b.price);
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ ok: false, error: "price must be a non-negative number" });
    }

    const durationDays =
      b.durationDays === null || b.durationDays === undefined || b.durationDays === ""
        ? null
        : parseInt(String(b.durationDays), 10);
    if (durationDays !== null && (!Number.isFinite(durationDays) || durationDays < 0)) {
      return res.status(400).json({ ok: false, error: "durationDays must be null or non-negative int" });
    }

    const unlimitedCalls = Boolean(b.unlimitedCalls);
    const dailyRaw = b.dailyFreeMinutes;
    const dailyFreeMinutes =
      dailyRaw === null || dailyRaw === undefined || dailyRaw === ""
        ? 0
        : parseInt(String(dailyRaw), 10);
    if (!Number.isFinite(dailyFreeMinutes) || dailyFreeMinutes < 0) {
      return res.status(400).json({ ok: false, error: "dailyFreeMinutes must be a non-negative int" });
    }

    const active = b.active === undefined ? true : Boolean(b.active);

    const row = await prisma.plan.create({
      data: {
        id,
        name,
        price,
        durationDays,
        unlimitedCalls,
        dailyFreeMinutes,
        active,
      },
    });

    await recordAdminAudit(req.admin.id, {
      action: "plan.create",
      entity: "plan",
      entityId: row.id,
      payload: { created: planSnapshot(row), requestBody: b },
      req,
    });

    res.status(201).json({ ok: true, data: planSnapshot(row) });
  } catch (err) {
    if (err?.code === "P2002") {
      return res.status(409).json({ ok: false, error: "A plan with this id already exists" });
    }
    console.error("createAdminPlan", err);
    res.status(500).json({ ok: false, error: err?.message || "Create failed" });
  }
}

export async function patchAdminPlan(req, res) {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) {
      return res.status(400).json({ ok: false, error: "plan id is required" });
    }

    const before = await prisma.plan.findUnique({ where: { id } });
    if (!before) {
      return res.status(404).json({ ok: false, error: "Plan not found" });
    }

    const b = req.body || {};
    const data = {};

    if (b.name !== undefined) {
      const name = String(b.name || "").trim();
      if (!name) return res.status(400).json({ ok: false, error: "name cannot be empty" });
      data.name = name;
    }
    if (b.price !== undefined) {
      const price = Number(b.price);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ ok: false, error: "price must be a non-negative number" });
      }
      data.price = price;
    }
    if (b.durationDays !== undefined) {
      if (b.durationDays === null || b.durationDays === "") {
        data.durationDays = null;
      } else {
        const d = parseInt(String(b.durationDays), 10);
        if (!Number.isFinite(d) || d < 0) {
          return res.status(400).json({ ok: false, error: "durationDays invalid" });
        }
        data.durationDays = d;
      }
    }
    if (b.unlimitedCalls !== undefined) data.unlimitedCalls = Boolean(b.unlimitedCalls);
    if (b.dailyFreeMinutes !== undefined) {
      const d = parseInt(String(b.dailyFreeMinutes), 10);
      if (!Number.isFinite(d) || d < 0) {
        return res.status(400).json({ ok: false, error: "dailyFreeMinutes invalid" });
      }
      data.dailyFreeMinutes = d;
    }
    if (b.active !== undefined) data.active = Boolean(b.active);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, error: "No valid fields to update" });
    }

    const row = await prisma.plan.update({ where: { id }, data });

    await recordAdminAudit(req.admin.id, {
      action: "plan.patch",
      entity: "plan",
      entityId: id,
      payload: { before: planSnapshot(before), after: planSnapshot(row), requestBody: b },
      req,
    });

    res.json({ ok: true, data: planSnapshot(row) });
  } catch (err) {
    console.error("patchAdminPlan", err);
    res.status(500).json({ ok: false, error: err?.message || "Update failed" });
  }
}
