-- Invalidate-all-sessions support: JWT payload includes tv; must match this column.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
