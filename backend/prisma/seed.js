/**
 * Seed default plans (idempotent — skips if any row exists).
 * Run: npx prisma db seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.plan.count();
  if (existing > 0) {
    console.log("[seed] Plan: already has rows, skipping.");
    return;
  }

  await prisma.plan.createMany({
    data: [
      { id: "free", name: "Free Plan", price: 0, durationDays: null, unlimitedCalls: false, dailyFreeMinutes: 5, active: true },
      { id: "daily", name: "Daily Unlimited", price: 0.25, durationDays: 1, unlimitedCalls: true, dailyFreeMinutes: 0, active: true },
      { id: "weekly", name: "Weekly Unlimited", price: 1.5, durationDays: 7, unlimitedCalls: true, dailyFreeMinutes: 0, active: true },
      { id: "monthly", name: "Monthly Unlimited", price: 5, durationDays: 30, unlimitedCalls: true, dailyFreeMinutes: 0, active: true },
    ],
    skipDuplicates: true,
  });
  console.log("[seed] Plan: inserted free / daily / weekly / monthly.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
