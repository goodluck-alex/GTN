-- AlterTable
ALTER TABLE "User"
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT,
ADD COLUMN     "twoFactorPendingSecret" TEXT,
ADD COLUMN     "twoFactorBackupHashes" JSONB NOT NULL DEFAULT '[]';
