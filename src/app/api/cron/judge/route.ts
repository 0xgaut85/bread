/**
 * Automatic Judging Cron Endpoint
 * 
 * Finds tasks with passed deadlines and triggers AI judging.
 * Also retries failed payments for PAYMENT_PENDING tasks.
 * 
 * Should be called periodically (e.g., every 5 minutes) by a cron service.
 * 
 * Protected by ADMIN_API_KEY or CRON_SECRET.
 * 
 * Railway Cron: Add this to railway.json or use external cron service
 * curl -X POST https://bread.markets/api/cron/judge -H "Authorization: Bearer YOUR_ADMIN_KEY"
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEscrowPublicKey, transferUsdcFromEscrow } from "@/lib/solana";
import { cleanupExpiredNonces } from "@/lib/nonce-store";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max for judging multiple tasks

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/**
 * POST /api/cron/judge
 * 
 * Automatically judge all tasks with passed deadlines.
 * Also retries failed payments for PAYMENT_PENDING tasks.
 * Requires Authorization header with ADMIN_API_KEY or CRON_SECRET.
 */
export async function POST(request: NextRequest) {
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

    const now = new Date();
    
    // Cleanup expired nonces (maintenance task)
    cleanupExpiredNonces().catch(console.error);

    // STEP 0: Cancel expired tasks with no submissions
    const cancelledTasks = await prisma.task.updateMany({
      where: {
        status: "OPEN",
        deadline: { lt: now },
        submissions: { none: {} },
      },
      data: { status: "CANCELLED" },
    });
    
    if (cancelledTasks.count > 0) {
      console.log(`[Cron Judge] Cancelled ${cancelledTasks.count} expired tasks with no submissions`);
    }

    // STEP 1: Retry failed payments for PAYMENT_PENDING tasks
    const paymentRetryResults = await retryFailedPayments();

    // STEP 2: Find tasks that need judging:
    // - Status is OPEN
    // - Deadline has passed
    // - Has at least one submission
    const tasksToJudge = await prisma.task.findMany({
      where: {
        status: "OPEN",
        deadline: { lt: now },
        submissions: {
          some: {}, // Has at least one submission
        },
      },
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

    const judgingResults: Array<{
      taskId: string;
      taskTitle: string;
      winnerId: string | null;
      winnerWallet: string | null;
      reward: number;
      transferSuccess: boolean;
      status: string;
      error?: string;
    }> = [];

    if (tasksToJudge.length > 0) {
      console.log(`[Cron Judge] Found ${tasksToJudge.length} tasks to judge`);

      // Judge each task
      for (const task of tasksToJudge) {
        try {
          console.log(`[Cron Judge] Judging task: ${task.title} (${task.id})`);

          // Update status to JUDGING
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "JUDGING" },
          });

          // Judge submissions
          const { winnerId, scores } = await judgeSubmissions(task);

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

          // Transfer reward to winner
          const escrowAddress = getEscrowPublicKey();
          const transfer = await transferUsdcFromEscrow(
            winner.submitter.walletAddress,
            task.reward
          );

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

          // Update task status based on payment success
          const newStatus = transfer.success ? "COMPLETED" : "PAYMENT_PENDING";
          await prisma.task.update({
            where: { id: task.id },
            data: { status: newStatus },
          });

          judgingResults.push({
            taskId: task.id,
            taskTitle: task.title,
            winnerId,
            winnerWallet: winner.submitter.walletAddress,
            reward: task.reward,
            transferSuccess: transfer.success,
            status: newStatus,
            error: transfer.error,
          });

          console.log(`[Cron Judge] Task ${task.id} ${newStatus}. Winner: ${winner.submitter.walletAddress}`);
        } catch (taskError) {
          console.error(`[Cron Judge] Error judging task ${task.id}:`, taskError);
          
          // Revert to OPEN status on error
          await prisma.task.update({
            where: { id: task.id },
            data: { status: "OPEN" },
          });

          judgingResults.push({
            taskId: task.id,
            taskTitle: task.title,
            winnerId: null,
            winnerWallet: null,
            reward: task.reward,
            transferSuccess: false,
            status: "OPEN",
            error: taskError instanceof Error ? taskError.message : "Unknown error",
          });
        }
      }
    }

    const judgedSuccessfully = judgingResults.filter((r) => r.winnerId !== null).length;
    const judgingFailed = judgingResults.filter((r) => r.winnerId === null).length;
    const paymentsPending = judgingResults.filter((r) => r.status === "PAYMENT_PENDING").length;

    return NextResponse.json({
      success: true,
      message: `Judged ${judgedSuccessfully} tasks, ${judgingFailed} failed, ${cancelledTasks.count} cancelled, ${paymentRetryResults.retried} payments retried`,
      cancelled: cancelledTasks.count,
      judging: {
        processed: tasksToJudge.length,
        successful: judgedSuccessfully,
        failed: judgingFailed,
        paymentPending: paymentsPending,
        results: judgingResults,
      },
      paymentRetries: paymentRetryResults,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("[Cron Judge] Error:", error);
    return NextResponse.json(
      { error: "Failed to run judging cron" },
      { status: 500 }
    );
  }
}

/**
 * Retry failed payments for PAYMENT_PENDING tasks
 */
async function retryFailedPayments(): Promise<{
  retried: number;
  successful: number;
  failed: number;
  results: Array<{ taskId: string; success: boolean; error?: string }>;
}> {
  const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

  // Find tasks with pending payments
  const pendingTasks = await prisma.task.findMany({
    where: { status: "PAYMENT_PENDING" },
    include: {
      submissions: {
        where: { isWinner: true },
        include: {
          submitter: {
            select: {
              walletAddress: true,
            },
          },
        },
      },
      escrowTx: {
        where: { 
          type: "RELEASE",
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (pendingTasks.length === 0) {
    return { retried: 0, successful: 0, failed: 0, results: [] };
  }

  console.log(`[Cron Judge] Retrying ${pendingTasks.length} pending payments`);

  for (const task of pendingTasks) {
    const winner = task.submissions[0];
    const pendingTx = task.escrowTx[0];

    if (!winner || !pendingTx) {
      console.error(`[Cron Judge] No winner or pending tx for task ${task.id}`);
      results.push({ taskId: task.id, success: false, error: "No winner or pending transaction" });
      continue;
    }

    try {
      const escrowAddress = getEscrowPublicKey();
      const transfer = await transferUsdcFromEscrow(
        winner.submitter.walletAddress,
        task.reward
      );

      if (transfer.success) {
        // Update escrow transaction
        await prisma.escrowTransaction.update({
          where: { id: pendingTx.id },
          data: {
            status: "CONFIRMED",
            txSignature: transfer.signature,
          },
        });

        // Update task status
        await prisma.task.update({
          where: { id: task.id },
          data: { status: "COMPLETED" },
        });

        console.log(`[Cron Judge] Payment retry successful for task ${task.id}`);
        results.push({ taskId: task.id, success: true });
      } else {
        console.error(`[Cron Judge] Payment retry failed for task ${task.id}: ${transfer.error}`);
        results.push({ taskId: task.id, success: false, error: transfer.error });
      }
    } catch (error) {
      console.error(`[Cron Judge] Payment retry error for task ${task.id}:`, error);
      results.push({ 
        taskId: task.id, 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  }

  return {
    retried: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };
}

/**
 * GET /api/cron/judge
 * 
 * Check status of tasks pending judgment (no auth required for status check)
 */
export async function GET() {
  try {
    const now = new Date();

    const [pendingJudgment, paymentPending, recentlyJudged, totalOpen] = await Promise.all([
      // Tasks ready for judgment
      prisma.task.count({
        where: {
          status: "OPEN",
          deadline: { lt: now },
          submissions: { some: {} },
        },
      }),
      // Tasks with pending payments
      prisma.task.count({
        where: { status: "PAYMENT_PENDING" },
      }),
      // Recently judged (last 24h)
      prisma.task.count({
        where: {
          status: "COMPLETED",
          updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
      // Total open tasks
      prisma.task.count({
        where: { status: "OPEN" },
      }),
    ]);

    return NextResponse.json({
      pendingJudgment,
      paymentPending,
      recentlyJudged,
      totalOpen,
      timestamp: now.toISOString(),
      note: "POST to this endpoint with Authorization header to trigger judging and payment retries",
    });
  } catch (error) {
    console.error("[Cron Judge] Status error:", error);
    return NextResponse.json(
      { error: "Failed to get status" },
      { status: 500 }
    );
  }
}

/**
 * Judge submissions for a task using Claude AI
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
  // If no AI available, pick randomly
  if (!anthropic) {
    console.log("[Cron Judge] No AI available, selecting random winner");
    const randomIndex = Math.floor(Math.random() * task.submissions.length);
    const winnerId = task.submissions[randomIndex].id;
    const scores: Record<string, { score: number; reasoning: string }> = {};
    
    task.submissions.forEach((sub) => {
      scores[sub.id] = {
        score: sub.id === winnerId ? 100 : Math.floor(Math.random() * 80),
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
${s.content}
`).join("\n---\n")}

---

## Your Judgment
Evaluate all submissions based on:
1. Quality and effort
2. Relevance to the task
3. Creativity and originality
4. Completeness

Respond with JSON:
\`\`\`json
{
  "winnerId": "id_of_best_submission",
  "scores": {
    "submission_id": {
      "score": 0-100,
      "reasoning": "Brief explanation"
    }
  }
}
\`\`\`

Be fair and thorough!`;

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
    // Validate result has required fields
    if (!result.winnerId || !result.scores) {
      throw new Error("Invalid response structure - missing winnerId or scores");
    }
    return result;
  } catch (error) {
    console.error("[Cron Judge] AI judging failed:", error);
    
    // Fallback to random selection
    const randomIndex = Math.floor(Math.random() * task.submissions.length);
    const winnerId = task.submissions[randomIndex].id;
    const scores: Record<string, { score: number; reasoning: string }> = {};
    
    task.submissions.forEach((sub) => {
      scores[sub.id] = {
        score: sub.id === winnerId ? 100 : Math.floor(Math.random() * 80),
        reasoning: "AI judging failed - fallback selection",
      };
    });

    return { winnerId, scores };
  }
}
