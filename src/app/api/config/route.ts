import { NextResponse } from "next/server";
import { TREASURY_ADDRESS, USDC_MINT } from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    treasuryAddress: TREASURY_ADDRESS,
    usdcMint: USDC_MINT,
    submissionFee: "0.01", // USDC
  });
}
