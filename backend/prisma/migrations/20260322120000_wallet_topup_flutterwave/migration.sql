-- CreateTable
CREATE TABLE "WalletTopupPayment" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "txRef" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "walletCredit" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "flutterwaveTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WalletTopupPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletTopupPayment_txRef_key" ON "WalletTopupPayment"("txRef");

CREATE INDEX "WalletTopupPayment_userId_idx" ON "WalletTopupPayment"("userId");

CREATE INDEX "WalletTopupPayment_status_idx" ON "WalletTopupPayment"("status");

ALTER TABLE "WalletTopupPayment" ADD CONSTRAINT "WalletTopupPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
