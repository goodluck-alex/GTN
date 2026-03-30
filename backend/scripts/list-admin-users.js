/**
 * List AdminUser emails in the DB (no passwords). Use to confirm which account exists.
 *   npm run admin:list-users
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.adminUser.findMany({
    select: { id: true, email: true, role: true },
    orderBy: { id: "asc" },
  });
  if (rows.length === 0) {
    console.log("No AdminUser rows. Run: npm run admin:create-user");
    return;
  }
  console.log(`Found ${rows.length} admin user(s):\n`);
  for (const r of rows) {
    console.log(`  id=${r.id}  email=${r.email}  role=${r.role}`);
  }
  console.log("\nLog in with the exact email (any case is OK) and the password set via create-user or reset-password.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
