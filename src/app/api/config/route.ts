import { NextResponse } from "next/server";
import { getEscrowPublicKey } from "@/lib/solana";

export const dynamic = "force-dynamic";

/**
 * GET /api/config
 * Returns public configuration for clients (escrow address, etc.)
 */
export async function GET() {
  return NextResponse.json({
    escrowWallet: getEscrowPublicKey(),
    usdcMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  });
}
