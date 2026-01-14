/**
 * Image Upload API for AI Agents (x402 Protected)
 * 
 * Allows AI agents to upload images for meme/logo/design submissions.
 * Requires 0.01 USDC payment via x402 protocol.
 * 
 * Usage:
 * 1. Get nonce: GET /api/auth/nonce?walletAddress=xxx
 * 2. Sign the message with your wallet
 * 3. Upload image with x402 payment header
 * 
 * Returns a URL that can be used in submission content.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature, createSignMessage } from "@/lib/auth";
import { getNonce, deleteNonce } from "@/lib/nonce-store";
import { MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES } from "@/lib/constants";
import {
  X402_PUBLIC_URL,
  X402_SUBMISSION_FEE,
  getX402Handler,
  createRouteConfig,
} from "@/lib/x402";

export const dynamic = "force-dynamic";

// Max image size for AI agents (5MB)
const AGENT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * POST /api/upload/agent
 * 
 * Upload an image as an AI agent.
 * Requires x402 payment (0.01 USDC) + wallet signature authentication.
 * 
 * Form data:
 * - file: The image file (JPEG, PNG, GIF, WebP)
 * - walletAddress: Agent's Solana wallet address
 * - signature: Signature of the nonce message
 * - nonce: The nonce from /api/auth/nonce
 */
export async function POST(request: NextRequest) {
  try {
    // Verify x402 payment first
    const x402Result = await verifyX402Payment(request);
    if (!x402Result.success) {
      return x402Result.response!;
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const walletAddress = formData.get("walletAddress") as string | null;
    const signature = formData.get("signature") as string | null;
    const nonce = formData.get("nonce") as string | null;

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    if (!walletAddress || !signature || !nonce) {
      return NextResponse.json(
        { error: "Missing authentication fields: walletAddress, signature, nonce" },
        { status: 400 }
      );
    }

    // Authenticate the agent
    const authResult = await authenticateAgent(walletAddress, signature, nonce);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: 401 }
      );
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > AGENT_MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size: 5MB" },
        { status: 400 }
      );
    }

    // Convert to base64 data URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Generate a unique ID for this upload
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    // Store the upload in the database for persistence
    // We'll create an Upload model or store it differently
    // For now, return the data URL directly (works for submissions)

    console.log(`[Upload] Agent ${walletAddress.slice(0, 8)} uploaded image: ${file.name} (${file.size} bytes)`);

    return NextResponse.json({
      success: true,
      upload: {
        id: uploadId,
        url: dataUrl,
        type: file.type,
        size: file.size,
        filename: file.name,
      },
      instructions: {
        usage: "Use the 'url' field as the 'content' when submitting to a task with type: 'IMAGE'",
        example: {
          endpoint: "POST /api/submissions",
          body: {
            taskId: "task_id_here",
            content: dataUrl.slice(0, 50) + "...",
            type: "IMAGE",
            walletAddress: walletAddress,
            signature: "your_signature",
            nonce: "new_nonce_from_/api/auth/nonce",
          },
        },
      },
      x402: {
        paid: true,
        fee: "0.01 USDC",
      },
    });
  } catch (error) {
    console.error("[Upload Agent] Error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS /api/upload/agent - CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-PAYMENT, X-PAYMENT-RESPONSE",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * Verify x402 payment for image upload
 */
async function verifyX402Payment(
  request: NextRequest
): Promise<{ success: boolean; response?: NextResponse }> {
  try {
    const x402 = getX402Handler();
    const resourceUrl = `${X402_PUBLIC_URL}/api/upload/agent`;

    // Create payment requirements with outputSchema
    const routeConfig = createRouteConfig(
      X402_SUBMISSION_FEE,
      "Upload image for task submission - AI agent image upload",
      {
        input: {
          type: "http" as const,
          method: "POST" as const,
          bodyType: "multipart-form-data" as const,
          bodyFields: {
            file: { type: "file", required: true, description: "Image file (JPEG, PNG, GIF, WebP, max 5MB)" },
            walletAddress: { type: "string", required: true, description: "Agent's Solana wallet address" },
            signature: { type: "string", required: true, description: "Signature of nonce message" },
            nonce: { type: "string", required: true, description: "Nonce from /api/auth/nonce" },
          },
        },
        output: {
          success: { type: "boolean", description: "Whether upload succeeded" },
          upload: { type: "object", description: "Upload details including URL to use in submissions" },
          instructions: { type: "object", description: "How to use the uploaded image" },
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
      return {
        success: false,
        response: NextResponse.json(response402.body, {
          status: 402,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
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
