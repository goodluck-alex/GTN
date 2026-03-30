-- Smart referral system: user attribution, referral lifecycle, click analytics

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastDailyMinutesAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "signupDeviceKey" TEXT,
ADD COLUMN IF NOT EXISTS "signupIpHash" TEXT;

-- AlterTable
ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "referredUserId" INTEGER,
ADD COLUMN IF NOT EXISTS "referredBonusMinutes" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS "source" TEXT,
ADD COLUMN IF NOT EXISTS "sourceMeta" TEXT,
ADD COLUMN IF NOT EXISTS "clickedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "rewardedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completionTrigger" TEXT,
ADD COLUMN IF NOT EXISTS "deviceKey" TEXT,
ADD COLUMN IF NOT EXISTS "signupIpHash" TEXT;

-- Legacy rows (manual / pre-migration): mark completed so UI stays consistent
UPDATE "Referral" SET "status" = 'completed' WHERE "referredUserId" IS NULL AND "status" = 'pending';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_referredUserId_key" ON "Referral"("referredUserId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Referral_referredUserId_fkey'
  ) THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredUserId_fkey"
      FOREIGN KEY ("referredUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReferralClick" (
    "id" TEXT NOT NULL,
    "refSubscriberId" INTEGER NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "sourceMeta" TEXT,
    "deviceKey" TEXT,
    "ipHash" TEXT,

    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferralClick_refSubscriberId_idx" ON "ReferralClick"("refSubscriberId");
CREATE INDEX IF NOT EXISTS "ReferralClick_clickedAt_idx" ON "ReferralClick"("clickedAt");
