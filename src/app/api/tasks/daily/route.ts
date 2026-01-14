/**
 * Hourly Tasks API
 * 
 * Hourly tasks are sponsored tasks that run every 2 hours with a 2-hour deadline.
 * The system checks escrow balance before creating hourly tasks.
 * 
 * If escrow doesn't have sufficient funds, tasks are NOT created
 * to prevent winners from not receiving their rewards.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HOURLY_BREAD_TASKS } from "@/lib/constants";

// Use the legacy alias for backwards compatibility
const HOURLY_TASKS = HOURLY_BREAD_TASKS;
import { getEscrowBalance, getEscrowPublicKey } from "@/lib/solana";
import { scheduleTaskJudging } from "@/lib/scheduler";

// Get current hourly tasks (auto-creates if none exist AND escrow has funds)
export async function GET() {
  try {
    const now = new Date();
    
    // Find active hourly tasks (created within last 2 hours, still open)
    let hourlyTasks = await prisma.task.findMany({
      where: {
        type: "DAILY", // Keep using DAILY type for compatibility
        status: "OPEN",
        deadline: { gt: now }, // Deadline hasn't passed yet
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
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Check if we need to create new hourly tasks
    // Create new ones if there are no active tasks with the exact title
    const activeTitles = new Set(hourlyTasks.map(t => t.title));
    const missingCategories = HOURLY_BREAD_TASKS.filter(
      task => !activeTitles.has(task.title)
    );

    if (missingCategories.length > 0) {
      console.log("[Hourly Bread] Missing categories:", missingCategories.map(t => t.category).join(", "));
      
      // Calculate total reward needed for missing tasks
      const totalRewardNeeded = missingCategories.reduce((sum, task) => sum + task.reward, 0);
      
      // Check escrow balance
      const escrowBalance = await getEscrowBalance();
      const escrowAddress = getEscrowPublicKey();
      
      if (escrowBalance < totalRewardNeeded) {
        console.warn(`[Hourly Bread] Insufficient escrow balance: ${escrowBalance} USDC, need ${totalRewardNeeded} USDC`);
        
        // Return existing tasks with warning
        return NextResponse.json({ 
          tasks: hourlyTasks,
          warning: {
            message: "Some hourly tasks unavailable - escrow needs funding",
            escrowAddress,
            currentBalance: escrowBalance,
            requiredBalance: totalRewardNeeded,
            fundingNeeded: totalRewardNeeded - escrowBalance,
          },
        });
      }
      
      console.log(`[Hourly Bread] Escrow has ${escrowBalance} USDC, creating tasks...`);
      
      // Get or create system user for hourly tasks
      let systemUser = await prisma.user.findFirst({
        where: { walletAddress: "SYSTEM" },
      });

      const logoUrl = "https://bread.markets/logo.png";
      
      if (!systemUser) {
        systemUser = await prisma.user.create({
          data: {
            walletAddress: "SYSTEM",
            name: "Bread",
            avatarUrl: logoUrl,
          },
        });
      } else if (systemUser.avatarUrl !== logoUrl || systemUser.name !== "Bread") {
        systemUser = await prisma.user.update({
          where: { id: systemUser.id },
          data: {
            name: "Bread",
            avatarUrl: logoUrl,
          },
        });
      }

      // Create hourly tasks with 2-hour deadline
      const escrowPubkey = getEscrowPublicKey();
      
      const newTasks = await Promise.all(
        missingCategories.map(async (task) => {
          const deadline = new Date(now.getTime() + task.deadlineHours * 60 * 60 * 1000);
          
          const createdTask = await prisma.task.create({
            data: {
              title: task.title,
              description: task.description,
              type: "DAILY",
              category: task.category,
              submissionType: task.submissionType,
              reward: task.reward,
              deadline,
              creatorId: systemUser.id,
              escrowTx: {
                create: {
                  type: "LOCK",
                  amount: task.reward,
                  fromWallet: escrowPubkey,
                  toWallet: escrowPubkey,
                  status: "CONFIRMED",
                  txSignature: `HOURLY-${Date.now()}-${task.category}`,
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
              _count: {
                select: { submissions: true },
              },
            },
          });

          // Schedule automatic judging when deadline passes
          try {
            scheduleTaskJudging(createdTask.id, createdTask.deadline);
          } catch (e) {
            console.error("[Hourly Bread] Failed to schedule judging:", e);
          }

          return createdTask;
        })
      );

      console.log("[Hourly Bread] Created", newTasks.length, "new tasks");
      
      // Combine with existing tasks
      hourlyTasks = [...newTasks, ...hourlyTasks];
    }

    return NextResponse.json({ tasks: hourlyTasks });
  } catch (error) {
    console.error("Get hourly tasks error:", error);
    return NextResponse.json(
      { error: "Failed to get hourly tasks" },
      { status: 500 }
    );
  }
}

// Manually trigger hourly task creation (admin only)
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const apiKey = process.env.ADMIN_API_KEY;

    if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const now = new Date();
    
    // Calculate total reward needed
    const totalRewardNeeded = HOURLY_BREAD_TASKS.reduce((sum, task) => sum + task.reward, 0);
    
    // Check escrow balance
    const escrowBalance = await getEscrowBalance();
    const escrowAddress = getEscrowPublicKey();
    
    if (escrowBalance < totalRewardNeeded) {
      return NextResponse.json({
        error: "Insufficient escrow balance for hourly tasks",
        escrowAddress,
        currentBalance: escrowBalance,
        requiredBalance: totalRewardNeeded,
        fundingNeeded: totalRewardNeeded - escrowBalance,
      }, { status: 400 });
    }

    // Get or create system user
    let systemUser = await prisma.user.findFirst({
      where: { walletAddress: "SYSTEM" },
    });

    const logoUrl = "https://bread.markets/logo.png";
    
    if (!systemUser) {
      systemUser = await prisma.user.create({
        data: {
          walletAddress: "SYSTEM",
          name: "Bread",
          avatarUrl: logoUrl,
        },
      });
    }

    const escrowPubkey = getEscrowPublicKey();
    
    const createdTasks = await Promise.all(
      HOURLY_BREAD_TASKS.map(async (task) => {
        const deadline = new Date(now.getTime() + task.deadlineHours * 60 * 60 * 1000);
        
        const createdTask = await prisma.task.create({
          data: {
            title: task.title,
            description: task.description,
            type: "DAILY",
            category: task.category,
            submissionType: task.submissionType,
            reward: task.reward,
            deadline,
            creatorId: systemUser.id,
            escrowTx: {
              create: {
                type: "LOCK",
                amount: task.reward,
                fromWallet: escrowPubkey,
                toWallet: escrowPubkey,
                status: "CONFIRMED",
                txSignature: `HOURLY-${Date.now()}-${task.category}`,
              },
            },
          },
        });

        // Schedule automatic judging
        try {
          scheduleTaskJudging(createdTask.id, createdTask.deadline);
        } catch (e) {
          console.error("[Hourly Bread] Failed to schedule judging:", e);
        }

        return createdTask;
      })
    );

    return NextResponse.json({
      message: "Hourly tasks created",
      tasks: createdTasks,
      escrow: {
        address: escrowAddress,
        balanceBefore: escrowBalance,
        reservedForTasks: totalRewardNeeded,
      },
    });
  } catch (error) {
    console.error("Create hourly tasks error:", error);
    return NextResponse.json(
      { error: "Failed to create hourly tasks" },
      { status: 500 }
    );
  }
}
