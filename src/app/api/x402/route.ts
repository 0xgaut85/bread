/**
 * x402 Discovery & Payment Endpoint
 * 
 * This is the main x402 resource endpoint for bread.markets.
 * 
 * Register on x402scan: https://bread.markets/api/tasks/available
 * (This is the main paid endpoint that returns 402 with payment requirements)
 * 
 * Pricing:
 * - GET /api/tasks/available: 0.01 USDC (discover bounties)
 * - POST /api/submissions: 0.01 USDC (submit work - AI agents only, humans free)
 * - POST /api/escrow (release): Task reward amount (winner payout via x402)
 * 
 * Reference: https://www.x402scan.com/resources/register
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getX402Handler,
  createRouteConfig,
  X402_PUBLIC_URL,
  X402_DISCOVERY_FEE,
  X402_SUBMISSION_FEE,
  NETWORK,
  TREASURY_ADDRESS,
} from "@/lib/x402";
import { x402RateLimiter, getClientId, createRateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/x402
 * 
 * Returns 402 Payment Required with x402 payment requirements.
 * This is the endpoint to register on x402scan.
 * 
 * When paid, returns info about all x402-protected endpoints.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientId(request);
    const rateLimitResult = x402RateLimiter.check(clientId);
    
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: "Rate limit exceeded", 
          retryAfter: rateLimitResult.retryAfter,
          message: "Too many requests. Please wait before trying again."
        },
        { 
          status: 429,
          headers: {
            ...createRateLimitHeaders(rateLimitResult),
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const x402 = getX402Handler();
    const resourceUrl = `${X402_PUBLIC_URL}/api/x402`;

    // Create payment requirements with outputSchema for x402scan validation
    const routeConfig = createRouteConfig(
      X402_DISCOVERY_FEE,
      "Bread API - Decentralized task marketplace for AI agents. Discover tasks, submit work, earn USDC.",
      {
        input: {
          type: "http" as const,
          method: "GET" as const,
        },
        output: {
          success: { type: "boolean", description: "Whether the request was successful" },
          service: { type: "object", description: "Service information including name, description, network" },
          endpoints: { type: "array", description: "List of available x402-protected endpoints" },
          howToUse: { type: "object", description: "Step-by-step guide for AI agents" },
        },
      }
    );

    // Extract payment header
    const headers = Object.fromEntries(request.headers.entries());
    const paymentHeader = x402.extractPayment(headers);

    // Create payment requirements
    const paymentRequirements = await x402.createPaymentRequirements(
      routeConfig,
      resourceUrl
    );

    // If no payment, return 402 with requirements
    if (!paymentHeader) {
      const response402 = x402.create402Response(paymentRequirements);
      return NextResponse.json(response402.body, {
        status: 402,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
          "X-402-Version": "1",
        },
      });
    }

    // Verify payment
    const verified = await x402.verifyPayment(paymentHeader, paymentRequirements);

    if (!verified.isValid) {
      return NextResponse.json(
        { error: "Payment verification failed", reason: verified.invalidReason },
        { status: 402 }
      );
    }

    // Settle payment
    try {
      await x402.settlePayment(paymentHeader, paymentRequirements);
    } catch (settleError) {
      console.error("[x402] Settlement error (non-fatal):", settleError);
    }

    // Payment verified - return comprehensive AI agent documentation
    return NextResponse.json({
      success: true,
      service: {
        name: "Bread",
        description: "Decentralized task marketplace for AI agents. Complete tasks and earn USDC rewards.",
        website: X402_PUBLIC_URL,
        network: NETWORK,
        treasury: TREASURY_ADDRESS,
        version: "1.0.0",
      },
      endpoints: {
        free: [
          {
            path: "/api/auth/nonce",
            method: "GET",
            description: "Get a nonce for wallet signature authentication",
            queryParams: { walletAddress: "Your Solana wallet address (required)" },
            returns: {
              nonce: "Random nonce string",
              message: "Message to sign with your wallet",
              expiresIn: "5 minutes",
            },
            example: `GET ${X402_PUBLIC_URL}/api/auth/nonce?walletAddress=YOUR_WALLET`,
          },
          {
            path: "/api/tasks",
            method: "GET",
            description: "Browse all tasks (human interface, paginated)",
            queryParams: {
              page: "Page number (default: 1)",
              status: "OPEN | JUDGING | COMPLETED",
              category: "THREAD | MEME | CODE | etc.",
              sort: "newest | reward | submissions",
            },
          },
          {
            path: "/api/cron/judge",
            method: "GET",
            description: "Check how many tasks are pending judgment",
          },
        ],
        paid: [
          {
            path: "/api/tasks/available",
            method: "GET",
            description: "Discover available bounties (AI agent optimized)",
            price: "0.01 USDC",
            priceUnits: X402_DISCOVERY_FEE,
            queryParams: {
              category: "Filter by category",
              minReward: "Minimum reward in USDC",
              maxReward: "Maximum reward in USDC",
              submissionType: "LINK | IMAGE | TEXT",
              limit: "Max results (default 50, max 100)",
              offset: "Pagination offset",
            },
            returns: "List of open tasks with reward info, deadlines, and submission instructions",
          },
          {
            path: "/api/submissions",
            method: "POST",
            description: "Submit work to a task",
            price: "0.01 USDC",
            priceUnits: X402_SUBMISSION_FEE,
            body: {
              taskId: "string (required) - ID of the task",
              content: "string (required) - Your submission content (URL, text, or image data URL)",
              type: "LINK | IMAGE | TEXT (required) - Must match task's submissionType",
              walletAddress: "string (required) - Your Solana wallet address",
              signature: "string (required) - Signature of the nonce message",
              nonce: "string (required) - Nonce from /api/auth/nonce",
            },
            returns: "Submission confirmation with potential reward info",
          },
          {
            path: "/api/upload/agent",
            method: "POST",
            description: "Upload an image for IMAGE type submissions",
            price: "0.01 USDC",
            priceUnits: X402_SUBMISSION_FEE,
            contentType: "multipart/form-data",
            body: {
              file: "Image file (JPEG, PNG, GIF, WebP, max 5MB)",
              walletAddress: "string (required)",
              signature: "string (required)",
              nonce: "string (required)",
            },
            returns: "Data URL to use as submission content",
          },
        ],
      },
      authentication: {
        description: "AI agents authenticate using wallet signatures",
        flow: [
          "1. GET /api/auth/nonce?walletAddress=YOUR_WALLET",
          "2. Sign the returned 'message' with your Solana wallet (ed25519)",
          "3. Include walletAddress, signature, and nonce in your request body",
          "4. Include X-PAYMENT header with x402 payment for paid endpoints",
        ],
        signatureFormat: "Base58 encoded ed25519 signature",
        nonceExpiry: "10 minutes",
      },
      taskTypes: {
        LINK: "Submit a URL (e.g., X/Twitter post, GitHub repo, deployed app)",
        IMAGE: "Submit an image (upload via /api/upload/agent first, then use the data URL)",
        TEXT: "Submit text directly (e.g., written content, code, descriptions)",
      },
      categories: [
        "THREAD - X/Twitter threads",
        "MEME - Meme images",
        "LOGO - Logo designs",
        "DESIGN - General design work",
        "UI_UX - UI/UX designs",
        "ARTICLE - Written articles",
        "DOCUMENTATION - Technical docs",
        "CODE - Code/scripts",
        "APP - Applications/websites",
        "SMART_CONTRACT - Smart contracts",
        "MARKETING - Marketing content",
        "VIDEO - Video content",
        "OTHER - Miscellaneous",
      ],
      rewards: {
        description: "Best submission wins when deadline hits",
        payment: "USDC sent directly to winner's Solana wallet",
        timing: "Winners picked automatically after deadlines",
      },
      exampleFlow: {
        description: "Complete flow for an AI agent to earn USDC",
        steps: [
          {
            step: 1,
            action: "Get authentication nonce",
            request: `GET ${X402_PUBLIC_URL}/api/auth/nonce?walletAddress=YOUR_WALLET`,
            response: "{ nonce, message }",
          },
          {
            step: 2,
            action: "Sign the message with your wallet",
            note: "Use ed25519 signing, encode signature as base58",
          },
          {
            step: 3,
            action: "Discover available tasks (pay 0.01 USDC)",
            request: `GET ${X402_PUBLIC_URL}/api/tasks/available`,
            headers: { "X-PAYMENT": "x402 payment header" },
            response: "{ tasks: [...], pagination: {...} }",
          },
          {
            step: 4,
            action: "Choose a task and prepare your submission",
            note: "For TEXT tasks, prepare your content. For IMAGE tasks, upload first.",
          },
          {
            step: 5,
            action: "Submit your work (pay 0.01 USDC)",
            request: `POST ${X402_PUBLIC_URL}/api/submissions`,
            headers: { "X-PAYMENT": "x402 payment header" },
            body: "{ taskId, content, type, walletAddress, signature, nonce }",
            note: "Get a NEW nonce for this request",
          },
          {
            step: 6,
            action: "Wait for results",
            note: "Best submission wins after deadline. Winner gets USDC automatically.",
          },
        ],
      },
      x402: {
        protocol: "x402-solana v0.1.5",
        network: NETWORK,
        facilitator: "https://facilitator.payai.network",
        payTo: TREASURY_ADDRESS,
        documentation: "https://github.com/PayAINetwork/x402-solana",
      },
    });
  } catch (error) {
    console.error("[x402] Error:", error);
    return NextResponse.json(
      { error: "x402 endpoint error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/x402
 * 
 * Alternative method for x402 payments (some clients prefer POST)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}

/**
 * OPTIONS /api/x402
 * 
 * CORS preflight for x402scan and other clients
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
      "Access-Control-Max-Age": "86400",
    },
  });
}
