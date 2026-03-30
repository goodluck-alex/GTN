import { prisma } from "../../prisma/client.js";

const DEFAULT_PLANS = [
  { id: "free", name: "Free Plan", price: 0, durationDays: null, unlimitedCalls: false, dailyFreeMinutes: 5 },
  { id: "daily", name: "Daily Unlimited", price: 0.25, durationDays: 1, unlimitedCalls: true, dailyFreeMinutes: 0 },
  { id: "weekly", name: "Weekly Unlimited", price: 1.5, durationDays: 7, unlimitedCalls: true, dailyFreeMinutes: 0 },
  { id: "monthly", name: "Monthly Unlimited", price: 5, durationDays: 30, unlimitedCalls: true, dailyFreeMinutes: 0 },
];

async function ensurePlansSeeded() {
  const count = await prisma.plan.count();
  if (count > 0) return;
  await prisma.plan.createMany({
    data: DEFAULT_PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      durationDays: p.durationDays,
      unlimitedCalls: p.unlimitedCalls,
      dailyFreeMinutes: p.dailyFreeMinutes,
      active: true,
    })),
    skipDuplicates: true,
  });
}

function planToClient(p) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    durationHours: p.durationDays ? p.durationDays * 24 : null,
    unlimited: Boolean(p.unlimitedCalls),
    dailyMinutes: p.dailyFreeMinutes || 0,
  };
}

export async function getPlansAndMe(userId) {
  await ensurePlansSeeded();
  const plans = await prisma.plan.findMany({ where: { active: true }, orderBy: { price: "asc" } });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const subs = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { startTime: "desc" },
    take: 10,
    include: { plan: true },
  });

  return {
    plans: plans.map(planToClient),
    me: {
      planId: user?.currentPlanId || "free",
      planExpiry: user?.planExpiry ? user.planExpiry.toISOString() : null,
    },
    history: subs.map((s) => ({
      id: s.id,
      planId: s.planId,
      planName: s.plan?.name || s.planId,
      startedAt: s.startTime.toISOString(),
      startedAtLabel: s.startTime.toISOString().slice(0, 10),
      status: s.status,
    })),
  };
}

export async function activatePlan(userId, planId, opts = {}) {
  const id = String(planId || "").trim();
  if (!id) throw new Error("planId is required");

  await ensurePlansSeeded();
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan || !plan.active) throw new Error("Invalid plan");

  const now = new Date();
  const expiry = plan.durationDays ? new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000) : null;

  // Optional idempotency + audit trail for payment-driven activations.
  const paymentId = opts?.paymentId ? String(opts.paymentId).trim() : "";
  const meta = opts?.metadata && typeof opts.metadata === "object" ? opts.metadata : null;

  // Fast-path idempotency: if this payment already activated, return success without changing anything.
  if (paymentId) {
    const existing = await prisma.subscription.findFirst({ where: { paymentId } });
    if (existing) {
      return {
        ok: true,
        planId: plan.id,
        planName: plan.name,
        planExpiry: existing.expiryTime ? existing.expiryTime.toISOString() : null,
        message: `${plan.name} already activated.`,
      };
    }
  }

  await prisma.$transaction(async (tx) => {
    if (paymentId) {
      await tx.planActivationAudit.create({
        data: {
          paymentId,
          userId,
          planId: plan.id,
          metadata: meta,
        },
      });
    }

    await tx.subscription.create({
      data: {
        userId,
        planId: plan.id,
        paymentId: paymentId || null,
        startTime: now,
        expiryTime: expiry,
        status: plan.unlimitedCalls ? "active" : "free",
      },
    });

    await tx.user.update({
      where: { id: userId },
      data: {
        currentPlanId: plan.id,
        planExpiry: expiry,
      },
    });
  }).catch(async (e) => {
    // If a retry raced and created the audit/subscription first, treat it as idempotent success.
    if (paymentId && (String(e?.code || "") === "P2002" || /unique/i.test(String(e?.message || "")))) {
      const existing = await prisma.subscription.findFirst({ where: { paymentId } });
      if (existing) {
        return;
      }
    }
    throw e;
  });

  return {
    ok: true,
    planId: plan.id,
    planName: plan.name,
    planExpiry: expiry ? expiry.toISOString() : null,
    message: plan.unlimitedCalls ? `${plan.name} activated.` : "Free plan active.",
  };
}

export function isUnlimitedActive(user) {
  const pid = user?.currentPlanId || "free";
  if (pid === "free") return false;
  if (!user?.planExpiry) return false;
  return new Date(user.planExpiry).getTime() > Date.now();
}

