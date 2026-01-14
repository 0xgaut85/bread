import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_PAGE_SIZE, ESCROW_WALLET_ADDRESS } from "@/lib/constants";
import { verifyUsdcDeposit } from "@/lib/solana";

// Get all tasks with sorting options
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE));
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const sort = searchParams.get("sort") || "newest";
    const creatorId = searchParams.get("creatorId");

    const search = searchParams.get("search");
    
    const where: Record<string, unknown> = {};

    // Handle search query - search in title, description, category, and creator name
    if (search && search.trim()) {
      const searchTerm = search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: "insensitive" } },
        { description: { contains: searchTerm, mode: "insensitive" } },
        { category: { contains: searchTerm.toUpperCase(), mode: "insensitive" } },
        { creator: { name: { contains: searchTerm, mode: "insensitive" } } },
        { creator: { walletAddress: { contains: searchTerm, mode: "insensitive" } } },
      ];
    }

    // Handle creatorId=me to get current user's tasks
    if (creatorId === "me") {
      const payload = await getCurrentUser();
      if (payload) {
        where.creatorId = payload.userId;
      } else {
        // Not authenticated, return empty
        return NextResponse.json({
          tasks: [],
          pagination: { page: 1, limit, total: 0, totalPages: 0 },
        });
      }
    } else if (creatorId) {
      where.creatorId = creatorId;
    }

    if (status) {
      where.status = status;
    } else {
      // By default, exclude COMPLETED and CANCELLED tasks (show only active tasks)
      where.status = { notIn: ["COMPLETED", "CANCELLED"] };
    }
    if (type) {
      where.type = type;
    }
    if (category) {
      where.category = category;
    }

    // Determine sort order based on sort parameter
    type OrderByType = { createdAt?: "desc" | "asc"; deadline?: "asc"; reward?: "desc"; submissions?: { _count: "desc" } };
    let orderBy: OrderByType | OrderByType[] = { createdAt: "desc" };

    switch (sort) {
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "ending":
        // Tasks ending soon (only open tasks, sorted by deadline ascending)
        where.status = where.status || "OPEN";
        where.deadline = { gte: new Date() };
        orderBy = { deadline: "asc" };
        break;
      case "reward":
        orderBy = { reward: "desc" };
        break;
      case "submissions":
      case "trending":
        // For trending/submissions, we'll sort by submission count
        orderBy = { submissions: { _count: "desc" } };
        break;
      default:
        orderBy = { createdAt: "desc" };
    }

    // Include submissions with winner info for completed tasks
    const includeSubmissions = status === "COMPLETED";

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          creator: {
            select: {
              id: true,
              walletAddress: true,
              name: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: { submissions: true },
          },
          ...(includeSubmissions && {
            submissions: {
              where: { isWinner: true },
              select: {
                id: true,
                isWinner: true,
                aiReasoning: true,
                submitter: {
                  select: {
                    walletAddress: true,
                    name: true,
                  },
                },
              },
            },
          }),
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({
      tasks,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get tasks error:", error);
    return NextResponse.json(
      { error: "Failed to get tasks" },
      { status: 500 }
    );
  }
}

// Create a new task (requires escrow deposit OR admin API key)
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const adminApiKey = process.env.ADMIN_API_KEY;
    const isAdmin = adminApiKey && authHeader === `Bearer ${adminApiKey}`;

    const payload = await getCurrentUser();

    if (!payload && !isAdmin) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, category, submissionType, reward, deadline, deadlineHours, escrowTxSignature } = body;

    // Validate required fields
    if (!title || !description || !category || !submissionType || !reward || (!deadline && !deadlineHours)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const rewardAmount = parseFloat(reward);
    if (rewardAmount < 0.01) {
      return NextResponse.json(
        { error: "Minimum reward is 0.01 USDC" },
        { status: 400 }
      );
    }

    // Calculate deadline from deadlineHours if provided
    const deadlineDate = deadlineHours 
      ? new Date(Date.now() + parseFloat(deadlineHours) * 60 * 60 * 1000)
      : new Date(deadline);

    // Validate deadline is at least 1 hour in the future (skip for admin)
    const minDeadline = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    if (!isAdmin && deadlineDate < minDeadline) {
      return NextResponse.json(
        { error: "Deadline must be at least 1 hour in the future" },
        { status: 400 }
      );
    }

    // Admin can skip escrow verification
    if (!isAdmin) {
      // Require escrow transaction for custom tasks
      if (!escrowTxSignature) {
        return NextResponse.json(
          { error: "Escrow deposit transaction is required" },
          { status: 400 }
        );
      }

      // SECURITY: Verify the escrow deposit on-chain before creating task
      const verification = await verifyUsdcDeposit(escrowTxSignature, rewardAmount);
      if (!verification.verified) {
        console.error(`[Task Creation] Escrow verification failed: ${verification.error}`);
        return NextResponse.json(
          { error: verification.error || "Escrow deposit verification failed. Please ensure you sent the correct amount to the escrow wallet." },
          { status: 400 }
        );
      }
    }

    // For admin, get or create system user
    let creatorId = payload?.userId;
    let fromWallet = payload?.walletAddress || "SYSTEM";
    
    if (isAdmin && !creatorId) {
      let systemUser = await prisma.user.findFirst({
        where: { walletAddress: "SYSTEM" }
      });
      
      if (!systemUser) {
        systemUser = await prisma.user.create({
          data: {
            walletAddress: "SYSTEM",
            name: "Bread",
            avatarUrl: "https://bread.markets/logo.png"
          }
        });
      }
      creatorId = systemUser.id;
      fromWallet = "SYSTEM";
    }

    // Create task
    const task = await prisma.task.create({
      data: {
        title,
        description,
        category,
        submissionType,
        reward: rewardAmount,
        deadline: deadlineDate,
        type: isAdmin ? "CUSTOM" : "CUSTOM",
        creatorId: creatorId!,
        escrowTx: {
          create: {
            type: "LOCK",
            amount: rewardAmount,
            fromWallet,
            toWallet: ESCROW_WALLET_ADDRESS,
            status: "CONFIRMED",
            txSignature: escrowTxSignature || `ADMIN-${Date.now()}`,
          },
        },
      },
      include: {
        creator: {
          select: {
            id: true,
            walletAddress: true,
            name: true,
            avatarUrl: true,
          },
        },
        escrowTx: true,
      },
    });

    console.log(`[Task Created] ${task.id} - ${rewardAmount} USDC - ${isAdmin ? 'ADMIN' : `tx: ${escrowTxSignature}`}`);

    // Schedule automatic judging when deadline passes
    try {
      const { scheduleTaskJudging } = await import("@/lib/scheduler");
      scheduleTaskJudging(task.id, task.deadline);
    } catch (e) {
      console.error("[Task Created] Failed to schedule judging:", e);
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Create task error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to create task", details: errorMessage },
      { status: 500 }
    );
  }
}
