import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/leaderboard
 * Returns users ranked by total earnings from winning submissions
 */
export async function GET() {
  try {
    // Get all users with their winning submissions and calculate total earnings
    const users = await prisma.user.findMany({
      where: {
        walletAddress: {
          not: "SYSTEM", // Exclude system user
        },
      },
      select: {
        id: true,
        walletAddress: true,
        name: true,
        avatarUrl: true,
        bio: true,
        submissions: {
          where: {
            isWinner: true,
          },
          select: {
            task: {
              select: {
                reward: true,
              },
            },
          },
        },
        _count: {
          select: {
            submissions: true,
            tasksCreated: true,
          },
        },
      },
    });

    // Calculate total earnings for each user
    const leaderboard = users
      .map((user) => {
        const totalEarnings = user.submissions.reduce(
          (sum, sub) => sum + (sub.task?.reward || 0),
          0
        );
        const wins = user.submissions.length;

        return {
          id: user.id,
          walletAddress: user.walletAddress,
          name: user.name,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          totalEarnings,
          wins,
          totalSubmissions: user._count.submissions,
          tasksCreated: user._count.tasksCreated,
        };
      })
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, 100); // Top 100

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
