import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Get single task
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        creator: {
          select: {
            id: true,
            walletAddress: true,
            name: true,
            avatarUrl: true,
            xHandle: true,
          },
        },
        submissions: {
          include: {
            submitter: {
              select: {
                id: true,
                walletAddress: true,
                name: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: [{ isWinner: "desc" }, { score: "desc" }, { createdAt: "desc" }],
        },
        escrowTx: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Get task error:", error);
    return NextResponse.json(
      { error: "Failed to get task" },
      { status: 500 }
    );
  }
}

// Update task
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const payload = await getCurrentUser();

    if (!payload) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    // Check if user owns the task
    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    if (existingTask.creatorId !== payload.userId) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    const task = await prisma.task.update({
      where: { id },
      data: {
        title: body.title,
        description: body.description,
        status: body.status,
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
      },
    });

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Update task error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// Delete task (only if no submissions)
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const payload = await getCurrentUser();

    if (!payload) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      include: { _count: { select: { submissions: true } } },
    });

    if (!task) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    if (task.creatorId !== payload.userId) {
      return NextResponse.json(
        { error: "Not authorized" },
        { status: 403 }
      );
    }

    if (task._count.submissions > 0) {
      return NextResponse.json(
        { error: "Cannot delete task with submissions" },
        { status: 400 }
      );
    }

    await prisma.task.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete task error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
