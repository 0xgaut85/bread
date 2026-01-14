/**
 * Admin Database Reset Endpoint
 * 
 * Deletes all tasks, submissions, and escrow transactions.
 * Keeps users intact.
 * 
 * DANGER: This is destructive! Only use for testing/development.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify admin authorization
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get confirmation from request body
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== "DELETE_ALL_TASKS") {
      return NextResponse.json({
        error: "Confirmation required",
        message: "Send { confirm: 'DELETE_ALL_TASKS' } to proceed",
      }, { status: 400 });
    }

    console.log("[Admin Reset] Starting database reset...");

    // Delete in order to respect foreign key constraints
    // 1. Delete all submissions
    const deletedSubmissions = await prisma.submission.deleteMany({});
    console.log(`[Admin Reset] Deleted ${deletedSubmissions.count} submissions`);

    // 2. Delete all escrow transactions
    const deletedEscrow = await prisma.escrowTransaction.deleteMany({});
    console.log(`[Admin Reset] Deleted ${deletedEscrow.count} escrow transactions`);

    // 3. Delete all tasks
    const deletedTasks = await prisma.task.deleteMany({});
    console.log(`[Admin Reset] Deleted ${deletedTasks.count} tasks`);

    return NextResponse.json({
      success: true,
      message: "Database reset complete",
      deleted: {
        tasks: deletedTasks.count,
        submissions: deletedSubmissions.count,
        escrowTransactions: deletedEscrow.count,
      },
    });
  } catch (error) {
    console.error("[Admin Reset] Error:", error);
    return NextResponse.json(
      { error: "Failed to reset database" },
      { status: 500 }
    );
  }
}

// GET to check current counts
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const [taskCount, submissionCount, escrowCount, userCount] = await Promise.all([
      prisma.task.count(),
      prisma.submission.count(),
      prisma.escrowTransaction.count(),
      prisma.user.count(),
    ]);

    return NextResponse.json({
      counts: {
        tasks: taskCount,
        submissions: submissionCount,
        escrowTransactions: escrowCount,
        users: userCount,
      },
      warning: "POST with { confirm: 'DELETE_ALL_TASKS' } to reset",
    });
  } catch (error) {
    console.error("[Admin Reset] Error:", error);
    return NextResponse.json(
      { error: "Failed to get counts" },
      { status: 500 }
    );
  }
}
