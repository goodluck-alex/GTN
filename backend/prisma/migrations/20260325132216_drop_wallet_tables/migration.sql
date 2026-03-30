/*
  Warnings:

  - You are about to drop the column `walletDebited` on the `Call` table. All the data in the column will be lost.
  - You are about to drop the column `walletBalance` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `RegistrationOtp` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WalletPackage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WalletTopupPayment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WalletTransaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WalletTopupPayment" DROP CONSTRAINT "WalletTopupPayment_packageId_fkey";

-- DropForeignKey
ALTER TABLE "WalletTopupPayment" DROP CONSTRAINT "WalletTopupPayment_userId_fkey";

-- DropForeignKey
ALTER TABLE "WalletTransaction" DROP CONSTRAINT "WalletTransaction_packageId_fkey";

-- DropForeignKey
ALTER TABLE "WalletTransaction" DROP CONSTRAINT "WalletTransaction_userId_fkey";

-- AlterTable
ALTER TABLE "Call" DROP COLUMN "walletDebited";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "walletBalance";

-- DropTable
DROP TABLE "RegistrationOtp";

-- DropTable
DROP TABLE "WalletPackage";

-- DropTable
DROP TABLE "WalletTopupPayment";

-- DropTable
DROP TABLE "WalletTransaction";
