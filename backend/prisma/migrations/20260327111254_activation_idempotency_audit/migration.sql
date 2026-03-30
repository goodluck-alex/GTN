/*
  Warnings:

  - A unique constraint covering the columns `[paymentId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "paymentId" TEXT;

-- CreateTable
CREATE TABLE "PlanActivationAudit" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "PlanActivationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanActivationAudit_paymentId_key" ON "PlanActivationAudit"("paymentId");

-- CreateIndex
CREATE INDEX "PlanActivationAudit_userId_createdAt_idx" ON "PlanActivationAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PlanActivationAudit_planId_createdAt_idx" ON "PlanActivationAudit"("planId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_paymentId_key" ON "Subscription"("paymentId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
