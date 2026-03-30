-- Link Flutterwave pending payments to optional WalletPackage (bundle checkout)

ALTER TABLE "WalletTopupPayment" ADD COLUMN IF NOT EXISTS "packageId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WalletTopupPayment_packageId_fkey'
  ) THEN
    ALTER TABLE "WalletTopupPayment" ADD CONSTRAINT "WalletTopupPayment_packageId_fkey"
      FOREIGN KEY ("packageId") REFERENCES "WalletPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WalletTopupPayment_packageId_idx" ON "WalletTopupPayment"("packageId");
