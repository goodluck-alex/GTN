-- AlterTable
ALTER TABLE "AdminUser" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdminUser" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- Tighten default role for newly created rows (existing rows unchanged)
ALTER TABLE "AdminUser" ALTER COLUMN "role" SET DEFAULT 'support';
