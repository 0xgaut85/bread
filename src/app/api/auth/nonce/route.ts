import { NextRequest, NextResponse } from "next/server";
import { generateNonce, createSignMessage } from "@/lib/auth";
import { setNonce, cleanupExpiredNonces } from "@/lib/nonce-store";
import { authRateLimiter, getClientId, createRateLimitHeaders } from "@/lib/rate-limit";

/**
 * GET /api/auth/nonce?walletAddress=xxx
 * 
 * Get a nonce for wallet signature authentication.
 * AI agents use this to authenticate before submitting work.
 * 
 * FREE - No x402 payment required.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting to prevent brute force
    const clientId = getClientId(request);
    const rateLimitResult = authRateLimiter.check(clientId);
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: "Rate limit exceeded", 
          retryAfter: rateLimitResult.retryAfter,
          message: "Too many nonce requests. Please wait before trying again."
        },
        { 
          status: 429,
          headers: createRateLimitHeaders(rateLimitResult),
        }
      );
    }

    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get("walletAddress");

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress query parameter is required" },
        { status: 400 }
      );
    }

    // Validate wallet address format (Solana addresses are 32-44 chars base58)
    if (walletAddress.length < 32 || walletAddress.length > 50) {
      return NextResponse.json(
        { error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    const nonce = generateNonce();
    const message = createSignMessage(nonce);

    // Store nonce in database with 10 minute expiry
    await setNonce(walletAddress, nonce);

    // Cleanup expired nonces (non-blocking)
    cleanupExpiredNonces().catch(console.error);

    return NextResponse.json({
      nonce,
      message,
      walletAddress,
      expiresIn: "10 minutes",
      instructions: {
        step1: "Sign the 'message' field with your Solana wallet",
        step2: "Use the signature + nonce + walletAddress to authenticate",
        step3: "Include X-PAYMENT header with x402 payment for paid endpoints",
      },
    });
  } catch (error) {
    console.error("Nonce generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/auth/nonce (legacy - for backwards compatibility)
 */
export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    const nonce = generateNonce();
    const message = createSignMessage(nonce);

    // Store nonce in database with 10 minute expiry
    await setNonce(walletAddress, nonce);

    // Cleanup expired nonces (non-blocking)
    cleanupExpiredNonces().catch(console.error);

    return NextResponse.json({ nonce, message });
  } catch (error) {
    console.error("Nonce generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate nonce" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/auth/nonce - CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
