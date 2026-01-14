-- CreateEnum: Add PAYMENT_PENDING to TaskStatus
ALTER TYPE "TaskStatus" ADD VALUE 'PAYMENT_PENDING';

-- CreateTable: Nonce storage for wallet signature authentication
CREATE TABLE "Nonce" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Nonce_walletAddress_key" ON "Nonce"("walletAddress");

-- CreateIndex
CREATE INDEX "Nonce_walletAddress_idx" ON "Nonce"("walletAddress");

-- CreateIndex
CREATE INDEX "Nonce_expiresAt_idx" ON "Nonce"("expiresAt");
