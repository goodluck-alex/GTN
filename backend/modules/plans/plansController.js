import * as plansService from "./plansService.js";

export async function getPlansAndMe(req, res) {
  try {
    const out = await plansService.getPlansAndMe(req.user.id);
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message || "plans_failed" });
  }
}

export async function activatePlan(req, res) {
  try {
    const planId = req.body?.planId;
    const out = await plansService.activatePlan(req.user.id, planId);
    res.json(out);
  } catch (err) {
    res.status(400).json({ error: err.message || "activate_failed" });
  }
}

