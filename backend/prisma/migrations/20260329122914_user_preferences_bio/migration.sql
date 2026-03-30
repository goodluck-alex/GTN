-- AlterTable
ALTER TABLE "User" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';
