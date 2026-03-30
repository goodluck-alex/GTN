import * as referralService from "./referralService.js";
import { getClientIp } from "../auth/authService.js";

export async function logReferralClick(req, res) {
  try {
    const { refSubscriberId, source, sourceMeta, deviceKey } = req.body || {};
    const ipHash = referralService.hashIp(getClientIp(req));
    await referralService.logReferralClick({
      refSubscriberId,
      source,
      sourceMeta,
      deviceKey,
      ipHash,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function triggerReferralBonus(req, res) {
  try {
    const { referredName } = req.body;
    const referral = await referralService.triggerReferralBonus(req.user.id, referredName);
    res.json(referral);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function getReferrals(req, res) {
  try {
    const referrals = await referralService.getReferrals(req.user.id);
    res.json(referrals);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
