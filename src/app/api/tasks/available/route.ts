/**
 * Available Tasks API for AI Agents (x402 Protected)
 * 
 * Requires 0.01 USDC payment via x402 protocol to access.
 * Returns machine-readable list of open bounties with submission info.
 *
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  NETWORK,
  TREASURY_ADDRESS,
  X402_PUBLIC_URL,
  X402_DISCOVERY_FEE,
  X402_SUBMISSION_FEE,
  usdcToMicroUnits,
  getX402Handler,
  createRouteConfig,
} from "@/lib/x402";
import { x402RateLimiter, getClientId, createRateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
    const resourceUrl = `${X402_PUBLIC_URL}/api/tasks/available`;

    // Create payment requirements with outputSchema for x402scan validation
    const routeConfig = createRouteConfig(
      X402_DISCOVERY_FEE,
      "Discover available tasks on Bread - AI agent task marketplace",
      {
        input: {
          type: "http" as const,
          method: "GET" as const,
          queryParams: {
            category: { type: "string", required: false, description: "Filter by category (THREAD, MEME, CODE, etc.)" },
            minReward: { type: "number", required: false, description: "Minimum reward in USDC" },
            maxReward: { type: "number", required: false, description: "Maximum reward in USDC" },
            submissionType: { type: "string", required: false, description: "Filter by submission type (LINK, IMAGE, TEXT)" },
            limit: { type: "number", required: false, description: "Max results (default 50, max 100)" },
            offset: { type: "number", required: false, description: "Pagination offset" },
          },
        },
        output: {
          tasks: { type: "array", description: "List of available bounties with reward and submission info" },
          pagination: { type: "object", description: "Pagination info (total, limit, offset, hasMore)" },
          meta: { type: "object", description: "Network and treasury info" },
          x402: { type: "object", description: "Payment confirmation" },
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

    // If no payment, return 402
    if (!paymentHeader) {
      const response402 = x402.create402Response(paymentRequirements);
      return NextResponse.json(response402.body, {
        status: 402,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
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

    // Payment verified - return tasks
    const { searchParams } = new URL(request.url);

    // Filter parameters
    const category = searchParams.get("category");
    const minReward = searchParams.get("minReward");
    const maxReward = searchParams.get("maxReward");
    const submissionType = searchParams.get("submissionType");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    // Build where clause
    const where: Record<string, unknown> = {
      status: "OPEN",
      deadline: { gt: new Date() },
    };

    if (category) {
      where.category = category.toUpperCase();
    }

    if (submissionType) {
      where.submissionType = submissionType.toUpperCase();
    }

    if (minReward || maxReward) {
      where.reward = {};
      if (minReward) {
        (where.reward as Record<string, number>).gte = parseFloat(minReward);
      }
      if (maxReward) {
        (where.reward as Record<string, number>).lte = parseFloat(maxReward);
      }
    }

    // Fetch tasks
    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          reward: true,
          category: true,
          submissionType: true,
          type: true,
          deadline: true,
          createdAt: true,
          creator: {
            select: {
              walletAddress: true,
              name: true,
            },
          },
          _count: {
            select: {
              submissions: true,
            },
          },
        },
        orderBy: [{ reward: "desc" }, { deadline: "asc" }],
        take: limit,
        skip: offset,
      }),
      prisma.task.count({ where }),
    ]);

    // Format for AI agents with x402 payment info
    const formattedTasks = tasks.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      reward: {
        amount: task.reward,
        currency: "USDC",
        microUnits: usdcToMicroUnits(task.reward),
      },
      category: task.category,
      submissionType: task.submissionType,
      type: task.type,
      deadline: task.deadline.toISOString(),
      createdAt: task.createdAt.toISOString(),
      submissionCount: task._count.submissions,
      creator: {
        wallet: task.creator.walletAddress,
        name: task.creator.name,
      },
      // x402 payment info for submission
      x402: {
        submitEndpoint: `${X402_PUBLIC_URL}/api/submissions`,
        submitPrice: X402_SUBMISSION_FEE,
        method: "POST",
        network: NETWORK,
        payTo: TREASURY_ADDRESS,
        expectedReward: usdcToMicroUnits(task.reward),
      },
    }));

    return NextResponse.json({
      tasks: formattedTasks,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + tasks.length < total,
      },
      meta: {
        network: NETWORK,
        treasury: TREASURY_ADDRESS,
        baseUrl: X402_PUBLIC_URL,
        timestamp: new Date().toISOString(),
      },
      x402: {
        paid: true,
        fee: "0.01 USDC",
      },
    });
  } catch (error) {
    console.error("[Tasks Available] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch available tasks" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/tasks/available
 * CORS preflight for x402 clients
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
      "Access-Control-Max-Age": "86400",
    },
  });
}
