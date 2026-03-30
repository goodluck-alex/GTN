import { prisma } from "../prisma/client.js";

for (const name of ["userSession", "counter", "user", "userBlock"]) {
  const d = prisma[/** @type {"userSession"} */ (name)];
  console.log(name, typeof d, d?.create ? "has create" : "MISSING");
}
await prisma.$disconnect();
