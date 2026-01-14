import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, verifySignature, createSignMessage } from "@/lib/auth";
import { getNonce, deleteNonce } from "@/lib/nonce-store";
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

    const body = await request.json();
    const { title, description, category, submissionType, reward, deadline, deadlineHours, escrowTxSignature, walletAddress, signature, nonce } = body;

    // Determine authentication method
    let userId: string | undefined;
    let userWallet: string | undefined;

    // Try cookie-based auth first (for web users)
    const payload = await getCurrentUser();
    
    if (payload) {
      userId = payload.userId;
      userWallet = payload.walletAddress;
    } 
    // Try wallet signature auth (for AI agents)
    else if (walletAddress && signature && nonce) {
      const authResult = await authenticateAgent(walletAddress, signature, nonce);
      if (!authResult.success) {
        return NextResponse.json(
          { error: authResult.error },
          { status: 401 }
        );
      }
      userId = authResult.userId;
      userWallet = walletAddress;
    }
    // Admin auth
    else if (!isAdmin) {
      return NextResponse.json(
        { error: "Not authenticated. Provide walletAddress, signature, and nonce for AI agent auth." },
        { status: 401 }
      );
    }

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
    let creatorId = userId;
    let fromWallet = userWallet || "SYSTEM";
    
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

/**
 * Authenticate an AI agent via wallet signature
 * Creates user profile if it doesn't exist
 */
async function authenticateAgent(
  walletAddress: string,
  signature: string,
  nonce: string
): Promise<{ success: boolean; userId?: string; error?: string }> {
  try {
    // SECURITY: Verify the nonce was actually issued to this wallet
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

    // SECURITY: Consume the nonce (one-time use)
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
      console.log(`[Auth] Created new user for wallet: ${walletAddress}`);
    }

    return { success: true, userId: user.id };
  } catch (error) {
    console.error("Agent authentication error:", error);
    return { success: false, error: "Authentication failed" };
  }
}
