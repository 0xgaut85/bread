/**
 * Task Completion & Automatic Payment Release
 * 
 * This endpoint handles the automatic completion of tasks when their deadline passes.
 * It judges submissions, picks a winner, and releases payment automatically.
 * 
 * Can be called:
 * 1. Automatically by the scheduler when deadline passes
 * 2. Manually by admin to force completion
 * 3. By the cron job as a backup
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getEscrowPublicKey,
  transferUsdcFromEscrow,
  getEscrowBalance,
} from "@/lib/solana";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutes max

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/tasks/[id]/complete
 * 
 * Complete a task: judge submissions, pick winner, release payment.
 * Requires admin authorization.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { id: taskId } = await context.params;
  
  try {
    // Verify authorization
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.ADMIN_API_KEY;
    const cronSecret = process.env.CRON_SECRET;

    const isAuthorized = 
      (apiKey && authHeader === `Bearer ${apiKey}`) ||
      (cronSecret && authHeader === `Bearer ${cronSecret}`);

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log(`[Complete] Starting completion for task ${taskId}`);

    // Get task with submissions
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        submissions: {
          include: {
            submitter: {
              select: {
                id: true,
                name: true,
                walletAddress: true,
              },
            },
          },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // Check if task can be completed
    if (task.status === "COMPLETED") {
      return NextResponse.json(
        { error: "Task already completed", status: task.status },
        { status: 400 }
      );
    }

    if (task.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Task was cancelled", status: task.status },
        { status: 400 }
      );
    }

    if (task.status === "JUDGING") {
      return NextResponse.json(
        { error: "Task is already being judged", status: task.status },
        { status: 400 }
      );
    }

    if (task.status === "PAYMENT_PENDING") {
      return NextResponse.json(
        { error: "Task already judged, payment pending", status: task.status },
        { status: 400 }
      );
    }

    // If no submissions, cancel the task
    if (task.submissions.length === 0) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "CANCELLED" },
      });
      
      console.log(`[Complete] Task ${taskId} cancelled - no submissions`);
      return NextResponse.json({
        success: true,
        message: "Task cancelled - no submissions",
        status: "CANCELLED",
      });
    }

    // ATOMIC: Update status to JUDGING only if still OPEN (prevents race condition)
    // If another process already started judging, this will update 0 rows
    const updateResult = await prisma.task.updateMany({
      where: { 
        id: taskId,
        status: "OPEN", // Only update if still OPEN
      },
      data: { status: "JUDGING" },
    });

    // If no rows updated, another process beat us to it
    if (updateResult.count === 0) {
      // Re-fetch to get current status
      const currentTask = await prisma.task.findUnique({
        where: { id: taskId },
        select: { status: true },
      });
      console.log(`[Complete] Task ${taskId} status changed during processing, current: ${currentTask?.status}`);
      return NextResponse.json(
        { error: "Task is no longer available for completion", status: currentTask?.status },
        { status: 409 } // Conflict
      );
    }

    console.log(`[Complete] Task ${taskId} has ${task.submissions.length} submissions, judging...`);

    // Judge submissions
    let winnerId: string;
    let scores: Record<string, { score: number; reasoning: string }> = {};

    try {
      const result = await judgeSubmissions(task);
      winnerId = result.winnerId;
      scores = result.scores;
    } catch (judgeError) {
      console.error(`[Complete] Judging failed for task ${taskId}:`, judgeError);
      
      // Fallback to first submission if judging fails
      winnerId = task.submissions[0].id;
      task.submissions.forEach((sub) => {
        scores[sub.id] = {
          score: sub.id === winnerId ? 100 : 50,
          reasoning: "Judging failed - selected first submission",
        };
      });
    }

    // Update submissions with scores
    await Promise.all(
      task.submissions.map((sub) =>
        prisma.submission.update({
          where: { id: sub.id },
          data: {
            score: scores[sub.id]?.score || 0,
            aiReasoning: scores[sub.id]?.reasoning || "",
            isWinner: sub.id === winnerId,
          },
        })
      )
    );

    // Get winner details
    const winner = task.submissions.find((s) => s.id === winnerId);
    if (!winner) {
      throw new Error("Winner not found in submissions");
    }

    console.log(`[Complete] Winner selected: ${winner.submitter.walletAddress.slice(0, 8)}... for ${task.reward} USDC`);

    // Check escrow balance before attempting transfer
    const escrowBalance = await getEscrowBalance();
    const escrowAddress = getEscrowPublicKey();

    if (escrowBalance < task.reward) {
      console.error(`[Complete] Insufficient escrow balance: ${escrowBalance} USDC, need ${task.reward} USDC`);
      
      // Create pending escrow transaction
      await prisma.escrowTransaction.create({
        data: {
          type: "RELEASE",
          amount: task.reward,
          fromWallet: escrowAddress,
          toWallet: winner.submitter.walletAddress,
          status: "PENDING",
          txSignature: null,
          taskId: task.id,
        },
      });

      // Mark as payment pending
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "PAYMENT_PENDING" },
      });

      return NextResponse.json({
        success: true,
        message: "Task judged but payment pending - insufficient escrow balance",
        winnerId,
        winnerWallet: winner.submitter.walletAddress,
        reward: task.reward,
        status: "PAYMENT_PENDING",
        escrow: {
          balance: escrowBalance,
          required: task.reward,
          address: escrowAddress,
        },
      });
    }

    // Attempt payment transfer with retries
    let transfer: { success: boolean; signature?: string; error?: string } = { success: false };
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[Complete] Payment attempt ${attempt}/${maxRetries} for task ${taskId}`);
      
      transfer = await transferUsdcFromEscrow(
        winner.submitter.walletAddress,
        task.reward
      );

      if (transfer.success) {
        console.log(`[Complete] Payment successful on attempt ${attempt}: ${transfer.signature}`);
        break;
      }

      console.error(`[Complete] Payment attempt ${attempt} failed: ${transfer.error}`);
      
      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    // Record escrow transaction
    await prisma.escrowTransaction.create({
      data: {
        type: "RELEASE",
        amount: task.reward,
        fromWallet: escrowAddress,
        toWallet: winner.submitter.walletAddress,
        status: transfer.success ? "CONFIRMED" : "PENDING",
        txSignature: transfer.signature || null,
        taskId: task.id,
      },
    });

    // Update task status
    const newStatus = transfer.success ? "COMPLETED" : "PAYMENT_PENDING";
    await prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus },
    });

    console.log(`[Complete] Task ${taskId} ${newStatus}. Winner: ${winner.submitter.walletAddress}`);

    return NextResponse.json({
      success: true,
      message: transfer.success 
        ? "Task completed and payment sent!" 
        : "Task judged but payment pending",
      taskId,
      taskTitle: task.title,
      winnerId,
      winnerWallet: winner.submitter.walletAddress,
      reward: task.reward,
      status: newStatus,
      transfer: {
        success: transfer.success,
        signature: transfer.signature,
        error: transfer.error,
      },
      scores,
    });
  } catch (error) {
    console.error(`[Complete] Error completing task ${taskId}:`, error);
    
    // Try to revert status on error
    try {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: "OPEN" },
      });
    } catch {
      // Ignore revert error
    }

    return NextResponse.json(
      { 
        error: "Failed to complete task",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Judge submissions using Claude AI
 */
async function judgeSubmissions(
  task: {
    id: string;
    title: string;
    description: string;
    category: string;
    submissions: Array<{
      id: string;
      content: string;
      type: string;
      submitter: {
        id: string;
        name: string | null;
        walletAddress: string;
      };
    }>;
  }
): Promise<{ winnerId: string; scores: Record<string, { score: number; reasoning: string }> }> {
  // If only one submission, it wins automatically
  if (task.submissions.length === 1) {
    const winnerId = task.submissions[0].id;
    return {
      winnerId,
      scores: {
        [winnerId]: {
          score: 100,
          reasoning: "Only submission - automatic winner",
        },
      },
    };
  }

  // If no AI available, pick randomly
  if (!anthropic) {
    console.log("[Complete] No AI available, selecting random winner");
    const randomIndex = Math.floor(Math.random() * task.submissions.length);
    const winnerId = task.submissions[randomIndex].id;
    const scores: Record<string, { score: number; reasoning: string }> = {};
    
    task.submissions.forEach((sub) => {
      scores[sub.id] = {
        score: sub.id === winnerId ? 100 : Math.floor(Math.random() * 80) + 20,
        reasoning: "AI judging not available - random selection",
      };
    });

    return { winnerId, scores };
  }

  // Build prompt for Claude
  const prompt = `You are an expert judge evaluating ${task.submissions.length} submissions for a task.

## Task Details
**Title:** ${task.title}
**Description:** ${task.description}
**Category:** ${task.category}

## Submissions

${task.submissions.map((s, i) => `### Submission ${i + 1}
**ID:** ${s.id}
**Submitter:** ${s.submitter.name || s.submitter.walletAddress.slice(0, 8)}
**Type:** ${s.type}
**Content:**
${s.content.length > 2000 ? s.content.slice(0, 2000) + "..." : s.content}
`).join("\n---\n")}

---

## Your Judgment
Evaluate all submissions based on:
1. Quality and effort
2. Relevance to the task
3. Creativity and originality
4. Completeness

Respond with JSON only (no other text):
{
  "winnerId": "id_of_best_submission",
  "scores": {
    "submission_id": {
      "score": 0-100,
      "reasoning": "Brief explanation"
    }
  }
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const result = JSON.parse(jsonMatch[0]);
    
    // Validate winnerId exists in submissions
    const validWinner = task.submissions.find(s => s.id === result.winnerId);
    if (!validWinner) {
      console.error("[Complete] AI returned invalid winnerId, falling back to first submission");
      result.winnerId = task.submissions[0].id;
    }

    return result;
  } catch (error) {
    console.error("[Complete] AI judging failed:", error);
    
    // Fallback to random selection
    const randomIndex = Math.floor(Math.random() * task.submissions.length);
    const winnerId = task.submissions[randomIndex].id;
    const scores: Record<string, { score: number; reasoning: string }> = {};
    
    task.submissions.forEach((sub) => {
      scores[sub.id] = {
        score: sub.id === winnerId ? 100 : Math.floor(Math.random() * 80) + 20,
        reasoning: "AI judging failed - fallback selection",
      };
    });

    return { winnerId, scores };
  }
}

/**
 * GET /api/tasks/[id]/complete
 * 
 * Check if a task is ready for completion
 */
export async function GET(request: NextRequest, context: RouteContext) {
  const { id: taskId } = await context.params;
  
  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        _count: {
          select: { submissions: true },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const deadlinePassed = new Date(task.deadline) < now;
    const hasSubmissions = task._count.submissions > 0;
    const canComplete = deadlinePassed && hasSubmissions && task.status === "OPEN";

    return NextResponse.json({
      taskId,
      title: task.title,
      status: task.status,
      deadline: task.deadline,
      deadlinePassed,
      submissionCount: task._count.submissions,
      reward: task.reward,
      canComplete,
      message: canComplete 
        ? "Task is ready for completion" 
        : !deadlinePassed 
          ? "Deadline has not passed yet"
          : !hasSubmissions
            ? "No submissions to judge"
            : `Task status is ${task.status}`,
    });
  } catch (error) {
    console.error(`[Complete] Error checking task ${taskId}:`, error);
    return NextResponse.json(
      { error: "Failed to check task status" },
      { status: 500 }
    );
  }
}
