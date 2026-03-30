-- AlterTable
ALTER TABLE "WalletTopupPayment" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "WalletTopupPayment_stripePaymentIntentId_key" ON "WalletTopupPayment"("stripePaymentIntentId");
