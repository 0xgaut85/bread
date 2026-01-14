/**
 * Submissions API with x402 Payment Protection
 *
 * - GET: Free - view submissions for a task
 * - POST: Requires 0.01 USDC via x402 for AI agents, free for authenticated humans
 * 
 * Returns x402 payment info for successful submissions.
 *
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifySignature, createSignMessage } from "@/lib/auth";
import { getNonce, deleteNonce } from "@/lib/nonce-store";
import { isDeadlinePassed } from "@/lib/utils";
import {
  NETWORK,
  TREASURY_ADDRESS,
  X402_PUBLIC_URL,
  X402_SUBMISSION_FEE,
  usdcToMicroUnits,
  getX402Handler,
  createRouteConfig,
} from "@/lib/x402";
import { x402RateLimiter, getClientId, createRateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Get submissions for a task or by submitter (free)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const submitterId = searchParams.get("submitterId");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, unknown> = {};

    if (taskId) {
      where.taskId = taskId;
    }

    // Handle submitterId=me to get current user's submissions
    if (submitterId === "me") {
      const payload = await getCurrentUser();
      if (payload) {
        where.submitterId = payload.userId;
      } else {
        // Not authenticated, return empty
        return NextResponse.json({ submissions: [] });
      }
    } else if (submitterId) {
      where.submitterId = submitterId;
    }

    // Require at least one filter
    if (!taskId && !submitterId) {
      return NextResponse.json(
        { error: "taskId or submitterId is required" },
        { status: 400 }
      );
    }

    const submissions = await prisma.submission.findMany({
      where,
      include: {
        submitter: {
          select: {
            id: true,
            walletAddress: true,
            name: true,
            avatarUrl: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            reward: true,
            status: true,
          },
        },
      },
      orderBy: [{ isWinner: "desc" }, { score: "desc" }, { createdAt: "desc" }],
      take: limit,
    });

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error("Get submissions error:", error);
    return NextResponse.json(
      { error: "Failed to get submissions" },
      { status: 500 }
    );
  }
}

// Create a submission (x402 protected for AI agents, free for humans)
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { taskId, content, type, walletAddress, signature, nonce } = body;

    // Determine authentication method
    let userId: string;
    let userWallet: string;
    let isAiAgent = false;

    // Check for AI agent authentication (wallet signature + x402 payment)
    if (walletAddress && signature && nonce) {
      isAiAgent = true;
      
      // AI agents must pay 0.01 USDC via x402
      const x402Result = await verifyX402Payment(request, taskId);
      if (!x402Result.success) {
        return x402Result.response!;
      }

      const authResult = await authenticateAgent(walletAddress, signature, nonce);
      if (!authResult.success) {
        return NextResponse.json(
          { error: authResult.error },
          { status: 401 }
        );
      }
      userId = authResult.userId!;
      userWallet = walletAddress;
    } else {
      // Human user authentication (cookie-based) - free
      const payload = await getCurrentUser();

      if (!payload) {
        return NextResponse.json(
          { error: "Not authenticated. For AI agents, provide walletAddress, signature, nonce, and X-PAYMENT header." },
          { status: 401 }
        );
      }
      userId = payload.userId;
      userWallet = payload.walletAddress;
    }

    if (!taskId || !content || !type) {
      return NextResponse.json(
        { error: "Missing required fields: taskId, content, type" },
        { status: 400 }
      );
    }

    // Check if task exists and is open
    const task = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.status !== "OPEN") {
      return NextResponse.json(
        { error: "Task is not accepting submissions" },
        { status: 400 }
      );
    }

    if (isDeadlinePassed(task.deadline)) {
      return NextResponse.json(
        { error: "Task deadline has passed" },
        { status: 400 }
      );
    }

    // Check if user is the task creator
    if (task.creatorId === userId) {
      return NextResponse.json(
        { error: "Cannot submit to your own task" },
        { status: 400 }
      );
    }

    // Check if user already submitted
    const existingSubmission = await prisma.submission.findUnique({
      where: {
        taskId_submitterId: {
          taskId,
          submitterId: userId,
        },
      },
    });

    if (existingSubmission) {
      return NextResponse.json(
        { error: "You have already submitted to this task" },
        { status: 400 }
      );
    }

    // Create submission
    const submission = await prisma.submission.create({
      data: {
        content,
        type,
        taskId,
        submitterId: userId,
      },
      include: {
        submitter: {
          select: {
            id: true,
            walletAddress: true,
            name: true,
            avatarUrl: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            reward: true,
          },
        },
      },
    });

    // Build response with x402 payment info for AI agents
    const response = {
      success: true,
      submission: {
        id: submission.id,
        content: submission.content,
        type: submission.type,
        createdAt: submission.createdAt.toISOString(),
        submitter: submission.submitter,
      },
      task: {
        id: submission.task.id,
        title: submission.task.title,
        reward: submission.task.reward,
      },
      // x402 payment info - how the agent will receive payment if they win
      x402: {
        network: NETWORK,
        treasury: TREASURY_ADDRESS,
        potentialReward: {
          amount: submission.task.reward,
          microUnits: usdcToMicroUnits(submission.task.reward),
          currency: "USDC",
        },
        paymentEndpoint: `${X402_PUBLIC_URL}/api/escrow`,
        winnerWallet: userWallet,
        note: "If your submission wins, the reward will be sent to your wallet via x402 protocol.",
        submissionFee: isAiAgent ? { paid: true, amount: "0.01 USDC" } : { paid: false, amount: "Free for humans" },
      },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error("Create submission error:", error);
    return NextResponse.json(
      { error: "Failed to create submission" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/submissions
 * CORS preflight for x402 clients
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

/**
 * Verify x402 payment for AI agent submissions
 */
async function verifyX402Payment(
  request: NextRequest,
  taskId: string
): Promise<{ success: boolean; response?: NextResponse }> {
  try {
    const x402 = getX402Handler();
    const resourceUrl = `${X402_PUBLIC_URL}/api/submissions`;

    // Create payment requirements (0.01 USDC)
    const routeConfig = createRouteConfig(
      X402_SUBMISSION_FEE,
      `Submit work to task ${taskId}`
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
      return {
        success: false,
        response: NextResponse.json(response402.body, {
          status: 402,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
          },
        }),
      };
    }

    // Verify payment
    const verified = await x402.verifyPayment(paymentHeader, paymentRequirements);

    if (!verified.isValid) {
      return {
        success: false,
        response: NextResponse.json(
          { error: "Payment verification failed", reason: verified.invalidReason },
          { status: 402 }
        ),
      };
    }

    // Settle payment
    try {
      await x402.settlePayment(paymentHeader, paymentRequirements);
    } catch (settleError) {
      console.error("[x402] Settlement error (non-fatal):", settleError);
    }

    return { success: true };
  } catch (error) {
    console.error("[x402] Payment verification error:", error);
    return {
      success: false,
      response: NextResponse.json(
        { error: "x402 payment processing failed" },
        { status: 500 }
      ),
    };
  }
}

/**
 * Authenticate an AI agent via wallet signature
 * 
 * Security flow:
 * 1. Agent requests nonce from GET /api/auth/nonce?walletAddress=xxx
 * 2. Agent signs the message containing the nonce
 * 3. Agent submits signature + nonce here
 * 4. We verify: nonce was issued to this wallet, signature is valid, nonce is consumed
 */
async function authenticateAgent(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // SECURITY: Verify the nonce was actually issued to this wallet (from database)
    const storedNonce = await getNonce(walletAddress);
    if (!storedNonce) {
      return { 
        success: false, 
        error: "Nonce expired or not found. Request a new nonce from GET /api/auth/nonce?walletAddress=YOUR_WALLET" 
      };
    }

    if (storedNonce !== nonce) {
      return { 
        success: false, 
        error: "Nonce mismatch. Use the nonce returned from /api/auth/nonce" 
      };
    }

    // Verify the signature
    const message = createSignMessage(nonce);
    const isValid = verifySignature(message, signature, walletAddress);

    if (!isValid) {
      return { success: false, error: "Invalid signature. Sign the exact message returned from /api/auth/nonce" };
    }

    // SECURITY: Consume the nonce (one-time use) - delete from database
    await deleteNonce(walletAddress);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          walletAddress,
          name: `Agent ${walletAddress.slice(0, 8)}`,
        },
      });
    }

    return { success: true, userId: user.id };
  } catch (error) {
    console.error("Agent authentication error:", error);
    return { success: false, error: "Authentication failed" };
  }
}
