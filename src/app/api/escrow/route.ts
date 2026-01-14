/**
 * Escrow API with x402 Protocol Integration
 *
 * - User deposits: Standard USDC transfer (verified on-chain)
 * - Escrow releases: x402 protocol for AI agent compatibility
 *
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { cookies } from "next/headers";
import {
  getEscrowBalance,
  getEscrowPublicKey,
  verifyUsdcDeposit,
  transferUsdcFromEscrow,
} from "@/lib/solana";
import {
  getX402Handler,
  createRouteConfig,
  usdcToMicroUnits,
  X402_PUBLIC_URL,
} from "@/lib/x402";

// Get escrow status and transactions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");

    const escrowAddress = getEscrowPublicKey();
    const balance = await getEscrowBalance();

    const where = taskId ? { taskId } : {};

    const transactions = await prisma.escrowTransaction.findMany({
      where,
      include: {
        task: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Get stats from transactions
    const stats = await prisma.escrowTransaction.groupBy({
      by: ["type", "status"],
      _sum: { amount: true },
      _count: true,
    });

    // Calculate locked amount from OPEN tasks (tasks awaiting completion)
    const openTasks = await prisma.task.aggregate({
      where: {
        status: { in: ["OPEN", "JUDGING", "PAYMENT_PENDING"] },
      },
      _sum: { reward: true },
      _count: true,
    });

    // Calculate total released from COMPLETED tasks
    const completedTasks = await prisma.task.aggregate({
      where: {
        status: "COMPLETED",
      },
      _sum: { reward: true },
      _count: true,
    });

    return NextResponse.json({
      escrowAddress,
      balance,
      transactions,
      stats,
      // Add task-based stats for accurate locked/released calculation
      taskStats: {
        locked: openTasks._sum.reward || 0,
        lockedCount: openTasks._count || 0,
        released: completedTasks._sum.reward || 0,
        releasedCount: completedTasks._count || 0,
      },
    });
  } catch (error) {
    console.error("Escrow GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch escrow data" },
      { status: 500 }
    );
  }
}

// Handle escrow operations (lock funds for task, release to winner)
export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("bread_auth")?.value;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { action, taskId, amount, txSignature, toWallet, useX402 } = body;

    if (!action || !taskId) {
      return NextResponse.json(
        { error: "Action and taskId are required" },
        { status: 400 }
      );
    }

    const escrowAddress = getEscrowPublicKey();
    if (!escrowAddress) {
      return NextResponse.json(
        { error: "Escrow not configured" },
        { status: 500 }
      );
    }

    // Verify task exists
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { creator: true },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    if (action === "lock") {
      // User is locking funds for a task they created
      if (task.creatorId !== payload.userId) {
        return NextResponse.json(
          { error: "Only task creator can lock funds" },
          { status: 403 }
        );
      }

      if (!txSignature || !amount) {
        return NextResponse.json(
          { error: "Transaction signature and amount required" },
          { status: 400 }
        );
      }

      // Verify the USDC deposit
      const verification = await verifyUsdcDeposit(txSignature, amount);

      if (!verification.verified) {
        return NextResponse.json(
          { error: verification.error || "Deposit verification failed" },
          { status: 400 }
        );
      }

      // Create escrow transaction record
      const escrowTx = await prisma.escrowTransaction.create({
        data: {
          type: "LOCK",
          amount,
          fromWallet: task.creator.walletAddress,
          toWallet: escrowAddress,
          status: "CONFIRMED",
          txSignature,
          taskId,
        },
      });

      // Update task with escrow transaction
      await prisma.task.update({
        where: { id: taskId },
        data: { escrowTxId: escrowTx.id },
      });

      return NextResponse.json({
        success: true,
        escrowTx,
        message: "Funds locked successfully",
      });
    }

    if (action === "release") {
      // Admin releasing funds to winner
      const authHeader = request.headers.get("authorization");
      const apiKey = process.env.ADMIN_API_KEY;

      if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
        return NextResponse.json(
          { error: "Admin authorization required" },
          { status: 403 }
        );
      }

      if (!toWallet) {
        return NextResponse.json(
          { error: "Winner wallet address required" },
          { status: 400 }
        );
      }

      // Check if x402 protocol should be used
      if (useX402) {
        return await handleX402Release(request, task, toWallet, escrowAddress);
      }

      // Check for existing pending/failed release transaction to avoid duplicates
      const existingReleaseTx = await prisma.escrowTransaction.findFirst({
        where: {
          taskId: task.id,
          type: "RELEASE",
          toWallet,
          status: { in: ["PENDING", "FAILED"] },
        },
        orderBy: { createdAt: "desc" },
      });

      // Standard transfer (fallback)
      const transfer = await transferUsdcFromEscrow(toWallet, task.reward);

      if (!transfer.success) {
        // Update existing transaction or create new one
        if (existingReleaseTx) {
          await prisma.escrowTransaction.update({
            where: { id: existingReleaseTx.id },
            data: { status: "FAILED" },
          });
        } else {
          await prisma.escrowTransaction.create({
            data: {
              type: "RELEASE",
              amount: task.reward,
              fromWallet: escrowAddress,
              toWallet,
              status: "FAILED",
              taskId: task.id,
            },
          });
        }

        return NextResponse.json(
          { error: transfer.error || "Transfer failed" },
          { status: 500 }
        );
      }

      // Update existing transaction or create new one on success
      let escrowTx;
      if (existingReleaseTx) {
        escrowTx = await prisma.escrowTransaction.update({
          where: { id: existingReleaseTx.id },
          data: {
            status: "CONFIRMED",
            txSignature: transfer.signature,
          },
        });
      } else {
        escrowTx = await prisma.escrowTransaction.create({
          data: {
            type: "RELEASE",
            amount: task.reward,
            fromWallet: escrowAddress,
            toWallet,
            status: "CONFIRMED",
            txSignature: transfer.signature,
            taskId: task.id,
          },
        });
      }

      return NextResponse.json({
        success: true,
        escrowTx,
        signature: transfer.signature,
        message: "Funds released to winner",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Escrow POST error:", error);
    return NextResponse.json(
      { error: "Escrow operation failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle x402 protocol release
 * This enables AI agents to receive payments via the x402 protocol
 */
async function handleX402Release(
  request: Request,
  task: { id: string; title: string; reward: number },
  toWallet: string,
  escrowAddress: string
) {
  try {
    const x402 = getX402Handler();
    const resourceUrl = `${X402_PUBLIC_URL}/api/escrow/release/${task.id}`;

    // Create payment requirements for the release
    const routeConfig = createRouteConfig(
      usdcToMicroUnits(task.reward),
      `Bread reward for: ${task.title}`
    );

    // Extract payment header from request
    const paymentHeader = x402.extractPayment(
      Object.fromEntries(request.headers.entries())
    );

    // Create payment requirements
    const paymentRequirements = await x402.createPaymentRequirements(
      routeConfig,
      resourceUrl
    );

    // If no payment header, return 402 with requirements
    if (!paymentHeader) {
      console.log("[x402] No payment header - returning 402");
      const response402 = x402.create402Response(paymentRequirements);
      return NextResponse.json(response402.body, { status: response402.status });
    }

    // Verify the payment
    const verified = await x402.verifyPayment(paymentHeader, paymentRequirements);

    if (!verified.isValid) {
      console.error("[x402] Payment verification failed:", verified.invalidReason);
      return NextResponse.json(
        { error: "Payment verification failed", reason: verified.invalidReason },
        { status: 402 }
      );
    }

    // Payment verified - execute the transfer
    const transfer = await transferUsdcFromEscrow(toWallet, task.reward);

    if (!transfer.success) {
      await prisma.escrowTransaction.create({
        data: {
          type: "RELEASE",
          amount: task.reward,
          fromWallet: escrowAddress,
          toWallet,
          status: "FAILED",
          taskId: task.id,
        },
      });

      return NextResponse.json(
        { error: transfer.error || "Transfer failed" },
        { status: 500 }
      );
    }

    // Settle the x402 payment
    try {
      const settlement = await x402.settlePayment(paymentHeader, paymentRequirements);
      console.log("[x402] Settlement result:", settlement);
    } catch (settleError) {
      console.error("[x402] Settlement error (non-fatal):", settleError);
    }

    // Create successful transaction record
    const escrowTx = await prisma.escrowTransaction.create({
      data: {
        type: "RELEASE",
        amount: task.reward,
        fromWallet: escrowAddress,
        toWallet,
        status: "CONFIRMED",
        txSignature: transfer.signature,
        taskId: task.id,
      },
    });

    return NextResponse.json({
      success: true,
      escrowTx,
      signature: transfer.signature,
      message: "Funds released via x402 protocol",
      x402: true,
    });
  } catch (error) {
    console.error("[x402] Release error:", error);
    return NextResponse.json(
      { error: "x402 release failed" },
      { status: 500 }
    );
  }
}
