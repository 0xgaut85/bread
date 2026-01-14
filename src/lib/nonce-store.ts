/**
 * Database-backed nonce store for wallet signature authentication
 * 
 * Uses PostgreSQL via Prisma for persistent storage.
 * Works correctly with multiple server instances and survives restarts.
 * 
 * Nonces expire after 10 minutes (increased from 5 for AI agent compatibility).
 */

import { prisma } from "@/lib/prisma";

const NONCE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Store a nonce for a wallet address
 * Uses upsert to handle both new and existing entries
 */
export async function setNonce(walletAddress: string, nonce: string): Promise<void> {
  const expiresAt = new Date(Date.now() + NONCE_EXPIRY_MS);
  
  await prisma.nonce.upsert({
    where: { walletAddress },
    update: { nonce, expiresAt },
    create: { walletAddress, nonce, expiresAt },
  });
}

/**
 * Get a nonce for a wallet address
 * Returns null if not found or expired
 */
export async function getNonce(walletAddress: string): Promise<string | null> {
  const entry = await prisma.nonce.findUnique({
    where: { walletAddress },
  });

  if (!entry) return null;

  // Check if expired
  if (entry.expiresAt < new Date()) {
    // Delete expired nonce
    await prisma.nonce.delete({
      where: { walletAddress },
    }).catch(() => {
      // Ignore if already deleted
    });
    return null;
  }

  return entry.nonce;
}

/**
 * Delete a nonce after use (one-time use)
 */
export async function deleteNonce(walletAddress: string): Promise<void> {
  await prisma.nonce.delete({
    where: { walletAddress },
  }).catch(() => {
    // Ignore if already deleted
  });
}

/**
 * Cleanup expired nonces from the database
 * Should be called periodically (e.g., in a cron job)
 */
export async function cleanupExpiredNonces(): Promise<number> {
  const result = await prisma.nonce.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  
  if (result.count > 0) {
    console.log(`[Nonce Store] Cleaned up ${result.count} expired nonces`);
  }
  
  return result.count;
}
