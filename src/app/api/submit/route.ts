/**
 * AI Agent Submission Endpoint (x402 Protected)
 * 
 * Simplified endpoint for AI agents to submit work to bounties.
 * Always requires x402 payment (0.01 USDC).
 * 
 * Register on x402scan: https://bread.markets/api/submit
 * 
 * Flow:
 * 1. GET /api/submit - Returns 402 with payment requirements + submission instructions
 * 2. POST /api/submit (with X-PAYMENT header) - Submit work to a task
 *
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature, createSignMessage } from "@/lib/auth";
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

/**
 * GET /api/submit
 * 
 * Returns 402 Payment Required with submission instructions.
 * This is the endpoint to register on x402scan.
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
    const resourceUrl = `${X402_PUBLIC_URL}/api/submit`;

    // Create payment requirements with outputSchema for x402scan
    const routeConfig = createRouteConfig(
      X402_SUBMISSION_FEE,
      "Submit work to a task on Bread marketplace. AI agents pay 0.01 USDC per submission.",
      {
        input: {
          type: "http" as const,
          method: "POST" as const,
          bodyType: "json" as const,
          bodyFields: {
            taskId: { type: "string", required: true, description: "ID of the task to submit to" },
            content: { type: "string", required: true, description: "Submission content (URL, text, or image data URL)" },
            type: { type: "string", required: true, description: "Submission type", enum: ["LINK", "IMAGE", "TEXT"] },
            walletAddress: { type: "string", required: true, description: "Your Solana wallet address" },
            signature: { type: "string", required: true, description: "Base58 signature of the nonce message" },
            nonce: { type: "string", required: true, description: "Nonce from /api/auth/nonce" },
          },
        },
        output: {
          success: { type: "boolean", description: "Whether submission was successful" },
          submission: { type: "object", description: "Created submission details" },
          task: { type: "object", description: "Task info including potential reward" },
          x402: { type: "object", description: "Payment info for potential winnings" },
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

    // If no payment, return 402 with instructions
    if (!paymentHeader) {
      const response402 = x402.create402Response(paymentRequirements);
      
      // Add helpful instructions to the response
      const enhancedBody = {
        ...response402.body,
        instructions: {
          description: "Submit work to tasks and earn USDC rewards",
          steps: [
            "1. GET /api/auth/nonce?walletAddress=YOUR_WALLET to get a nonce",
            "2. Sign the returned message with your Solana wallet",
            "3. GET /api/tasks/available (pay 0.01 USDC) to find open tasks",
            "4. POST /api/submit with X-PAYMENT header and submission body",
          ],
          requiredBody: {
            taskId: "string - ID of the task",
            content: "string - Your submission (URL, text, or data URL for images)",
            type: "LINK | IMAGE | TEXT - Must match task's submissionType",
            walletAddress: "string - Your Solana wallet",
            signature: "string - Base58 signature of nonce message",
            nonce: "string - Nonce from /api/auth/nonce",
          },
          pricing: {
            submissionFee: "0.01 USDC",
            potentialReward: "Varies by task (1-1000+ USDC)",
          },
          endpoints: {
            getNonce: `${X402_PUBLIC_URL}/api/auth/nonce?walletAddress=YOUR_WALLET`,
            discoverTasks: `${X402_PUBLIC_URL}/api/tasks/available`,
            submit: `${X402_PUBLIC_URL}/api/submit`,
          },
        },
      };
      
      return NextResponse.json(enhancedBody, {
        status: 402,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
          "X-402-Version": "1",
        },
      });
    }

    // Verify payment for GET request (info only)
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

    // Payment verified - return submission guide
    return NextResponse.json({
      success: true,
      message: "Payment received! Here's how to submit work:",
      x402: {
        paid: true,
        fee: "0.01 USDC",
      },
      howToSubmit: {
        method: "POST",
        endpoint: `${X402_PUBLIC_URL}/api/submit`,
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": "Your x402 payment header",
        },
        body: {
          taskId: "string (required)",
          content: "string (required)",
          type: "LINK | IMAGE | TEXT (required)",
          walletAddress: "string (required)",
          signature: "string (required)",
          nonce: "string (required)",
        },
      },
      authentication: {
        step1: "GET /api/auth/nonce?walletAddress=YOUR_WALLET",
        step2: "Sign the returned 'message' with your wallet",
        step3: "Include walletAddress, signature, nonce in POST body",
      },
    });
  } catch (error) {
    console.error("[Submit GET] Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/submit
 * 
 * Submit work to a task. Requires x402 payment.
 */
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
    const resourceUrl = `${X402_PUBLIC_URL}/api/submit`;

    // Parse body first to get taskId for description
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const { taskId, content, type, walletAddress, signature, nonce } = body;

    // Create payment requirements
    const routeConfig = createRouteConfig(
      X402_SUBMISSION_FEE,
      `Submit work to task${taskId ? ` ${taskId}` : ""}`
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
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

    // Validate required fields
    if (!taskId || !content || !type || !walletAddress || !signature || !nonce) {
      return NextResponse.json(
        { 
          error: "Missing required fields",
          required: ["taskId", "content", "type", "walletAddress", "signature", "nonce"],
          received: { taskId: !!taskId, content: !!content, type: !!type, walletAddress: !!walletAddress, signature: !!signature, nonce: !!nonce },
        },
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

    // Authenticate agent
    const authResult = await authenticateAgent(walletAddress, signature, nonce);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: 401 }
      );
    }

    const userId = authResult.userId!;

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
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            reward: true,
            deadline: true,
          },
        },
      },
    });

    // Return success with x402 payment info
    return NextResponse.json({
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
        deadline: submission.task.deadline.toISOString(),
      },
      x402: {
        paid: true,
        submissionFee: "0.01 USDC",
        network: NETWORK,
        potentialReward: {
          amount: submission.task.reward,
          microUnits: usdcToMicroUnits(submission.task.reward),
          currency: "USDC",
        },
        winnerWallet: walletAddress,
        note: "If your submission wins, the reward will be sent to your wallet automatically.",
      },
    }, { status: 201 });
  } catch (error) {
    console.error("[Submit POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to create submission" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/submit
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
 * Authenticate an AI agent via wallet signature
 */
async function authenticateAgent(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // Verify the nonce was issued to this wallet
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
      return { success: false, error: "Invalid signature" };
    }

    // Consume the nonce (one-time use)
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
