-- Wallet packages + optional link from transactions

CREATE TABLE IF NOT EXISTS "WalletPackage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "minutes" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletPackage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WalletTransaction" ADD COLUMN IF NOT EXISTS "packageId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WalletTransaction_packageId_fkey'
  ) THEN
    ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "WalletPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
