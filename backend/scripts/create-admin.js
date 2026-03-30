/**
 * One-time bootstrap: create an AdminUser if none exists with this email.
 * Usage:
 *   ADMIN_BOOTSTRAP_EMAIL=ops@example.com ADMIN_BOOTSTRAP_PASSWORD='...' node scripts/create-admin.js
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
  const name = String(process.env.ADMIN_BOOTSTRAP_NAME || "Admin").trim() || "Admin";
  /** superadmin | support — support cannot edit plans or payment capabilities (RBAC). */
  const role = String(process.env.ADMIN_BOOTSTRAP_ROLE || "superadmin").trim() || "superadmin";

  if (!email || !password) {
    console.error("Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in the environment.");
    process.exit(1);
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`[create-admin] Admin already exists: ${email}`);
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await prisma.adminUser.create({
    data: { email, password: hash, name, role },
  });
  console.log(`[create-admin] Created admin: ${email} (${role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
