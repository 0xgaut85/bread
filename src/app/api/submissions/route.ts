/**
 * Submissions API with Direct Payment Verification
 *
 * - GET: Free - view submissions for a task
 * - POST: Requires 0.01 USDC payment signature for AI agents, free for authenticated humans
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifySignature, createSignMessage } from "@/lib/auth";
import { getNonce, deleteNonce } from "@/lib/nonce-store";
import { isDeadlinePassed } from "@/lib/utils";
import { TREASURY_ADDRESS, usdcToMicroUnits } from "@/lib/x402";
import { x402RateLimiter, getClientId, createRateLimitHeaders } from "@/lib/rate-limit";
import { getConnection, USDC_MINT } from "@/lib/solana";

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

// Create a submission (payment protected for AI agents)
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
    const { taskId, content, type, walletAddress, signature, nonce, paymentSignature } = body;

    // Determine authentication method
    let userId: string;
    let userWallet: string;
    let isAiAgent = false;

    // Check for AI agent authentication (wallet signature + payment)
    if (walletAddress && signature && nonce) {
      isAiAgent = true;
      
      // AI agents must pay 0.01 USDC
      if (!paymentSignature) {
        return NextResponse.json(
          { 
            error: "Payment required", 
            message: "Please include 'paymentSignature' for 0.01 USDC transfer to treasury",
            treasury: TREASURY_ADDRESS,
            amount: 0.01,
            currency: "USDC"
          }, 
          { status: 402 }
        );
      }

      // Verify payment
      const paymentResult = await verifyPaymentTransaction(paymentSignature, 0.01, TREASURY_ADDRESS);
      if (!paymentResult.verified) {
        return NextResponse.json(
          { error: paymentResult.error || "Payment verification failed" },
          { status: 402 }
        );
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
          { error: "Not authenticated. For AI agents, provide walletAddress, signature, nonce, and paymentSignature." },
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

    // Validate content is not empty or too short
    const trimmedContent = typeof content === "string" ? content.trim() : "";
    if (trimmedContent.length < 3) {
      return NextResponse.json(
        { error: "Submission content is too short. Please provide meaningful content." },
        { status: 400 }
      );
    }

    // Validate content length (prevent extremely large submissions)
    if (trimmedContent.length > 100000) {
      return NextResponse.json(
        { error: "Submission content is too long. Maximum 100,000 characters." },
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
      payment: isAiAgent ? { paid: true, signature: paymentSignature } : { paid: false, status: "free" }
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
 * CORS preflight
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
 * Authenticate an AI agent via wallet signature
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

/**
 * Verify payment transaction on Solana
 */
async function verifyPaymentTransaction(
  signature: string,
  amount: number,
  recipient: string
): Promise<{ verified: boolean; error?: string }> {
  try {
    // Basic format check
    if (!signature || signature.length < 64) {
      return { verified: false, error: "Invalid signature format" };
    }

    const connection = getConnection();
    
    // Get transaction
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed"
    });

    if (!tx) {
      return { verified: false, error: "Transaction not found on chain" };
    }

    if (tx.meta?.err) {
      return { verified: false, error: "Transaction failed on chain" };
    }

    // Check time (e.g. within 24 hours to be safe against very old replays, 
    // or even stricter if we want to prevent reuse. 
    // Ideally we store used signatures but that requires DB schema change.
    // For now, we rely on timestamp check.)
    if (tx.blockTime && (Date.now() / 1000 - tx.blockTime > 3600)) {
        return { verified: false, error: "Transaction is too old (expire > 1h)" };
    }

    // Check for USDC transfer
    const postBalances = tx.meta?.postTokenBalances || [];
    const preBalances = tx.meta?.preTokenBalances || [];

    for (const postBalance of postBalances) {
      if (
        postBalance.mint === USDC_MINT.toBase58() && 
        postBalance.owner === recipient
      ) {
        const preBalance = preBalances.find(p => p.accountIndex === postBalance.accountIndex);
        const preAmount = preBalance?.uiTokenAmount?.uiAmount || 0;
        const postAmount = postBalance.uiTokenAmount?.uiAmount || 0;
        const received = postAmount - preAmount;

        // Allow small tolerance? No, USDC is precise enough. 
        // But float math might be slightly off.
        if (received >= amount * 0.999) {
          return { verified: true };
        }
      }
    }

    return { verified: false, error: `Payment of ${amount} USDC to treasury not found in transaction` };
  } catch (error) {
    console.error("Payment verification error:", error);
    return { verified: false, error: "Verification error" };
  }
}
