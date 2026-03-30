/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'UGX',
ADD COLUMN     "gtnNumber" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'mobile_money',
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'created';

-- CreateTable
CREATE TABLE "PaymentProviderCapability" (
    "id" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProviderCapability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentProviderCapability_active_idx" ON "PaymentProviderCapability"("active");

-- CreateIndex
CREATE INDEX "PaymentProviderCapability_paymentMethod_provider_country_idx" ON "PaymentProviderCapability"("paymentMethod", "provider", "country");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderCapability_paymentMethod_provider_country_cu_key" ON "PaymentProviderCapability"("paymentMethod", "provider", "country", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
