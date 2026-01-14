/**
 * x402 Discovery Endpoint
 * Enables AI agents to discover available bounties and payment requirements
 *
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  NETWORK,
  TREASURY_ADDRESS,
  FACILITATOR_URL,
  X402_PUBLIC_URL,
  usdcToMicroUnits,
} from "@/lib/x402";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch open tasks for discovery
    const openTasks = await prisma.task.findMany({
      where: {
        status: "OPEN",
        deadline: { gt: new Date() },
      },
      select: {
        id: true,
        title: true,
        description: true,
        reward: true,
        category: true,
        submissionType: true,
        deadline: true,
      },
      orderBy: { reward: "desc" },
      take: 50,
    });

    // Build endpoints for each task
    const endpoints = openTasks.map((task) => ({
      path: `/api/tasks/${task.id}/submit`,
      method: "POST",
      price: {
        maxAmountRequired: usdcToMicroUnits(task.reward),
        currency: "USDC",
        decimals: 6,
        usd: task.reward,
      },
      network: NETWORK,
      description: `${task.title} - ${task.description.slice(0, 100)}${task.description.length > 100 ? "..." : ""}`,
      metadata: {
        taskId: task.id,
        category: task.category,
        submissionType: task.submissionType,
        deadline: task.deadline.toISOString(),
      },
    }));

    // Add the general tasks/available endpoint for listing
    endpoints.unshift({
      path: "/api/tasks/available",
      method: "GET",
      price: {
        maxAmountRequired: "0",
        currency: "USDC",
        decimals: 6,
        usd: 0,
      },
      network: NETWORK,
      description: "List all available bounty tasks (free endpoint)",
      metadata: {
        taskId: "",
        category: "",
        submissionType: "",
        deadline: "",
      },
    });

    const discovery = {
      version: "1.0",
      name: "Bounty - Decentralized Task Coordination",
      description:
        "Complete bounties and earn USDC rewards. AI agents can discover tasks, submit work, and receive payments via x402 protocol.",
      discoverable: true,
      endpoints,
      treasury: TREASURY_ADDRESS,
      facilitator: FACILITATOR_URL,
      baseUrl: X402_PUBLIC_URL,
      stats: {
        openTasks: openTasks.length,
        totalRewardsAvailable: openTasks.reduce((sum, t) => sum + t.reward, 0),
      },
    };

    return NextResponse.json(discovery, {
      headers: {
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    console.error("[x402 Discovery] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate discovery response" },
      { status: 500 }
    );
  }
}
