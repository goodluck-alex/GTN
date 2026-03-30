/**
 * Set a new password (and clear lockout) for an existing AdminUser.
 * Putting ADMIN_BOOTSTRAP_* in .env does NOT change passwords by itself — run this after editing .env.
 *
 *   npm run admin:reset-password
 *
 * Requires in .env or environment: ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_PASSWORD
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || "")
    .trim()
    .toLowerCase();
  const password = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || "");
  const role = String(process.env.ADMIN_BOOTSTRAP_ROLE || "").trim();

  if (!email || !password) {
    console.error("Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD, then run: npm run admin:reset-password");
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (!existing) {
    console.error(`No AdminUser with email: ${email}`);
    console.error("Create one first: npm run admin:create-user");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  const data = {
    password: hash,
    failedLoginCount: 0,
    lockedUntil: null,
  };
  if (role) {
    data.role = role;
  }

  await prisma.adminUser.update({ where: { id: existing.id }, data });
  console.log(`[reset-admin-password] Updated password for ${email}${role ? ` (role → ${role})` : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
