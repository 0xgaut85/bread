"use client";

import React from "react";
import Link from "next/link";
import { formatRelativeTime, formatUsdc, truncateAddress } from "@/lib/utils";

interface TaskCardProps {
  task: {
    id: string;
    title: string;
    description: string;
    type: "DAILY" | "CUSTOM";
    category: "THREAD" | "MEME" | "LOGO" | "DESIGN" | "UI_UX" | "ARTICLE" | "DOCUMENTATION" | "CODE" | "APP" | "SMART_CONTRACT" | "MARKETING" | "VIDEO" | "OTHER";
    submissionType: "LINK" | "IMAGE" | "TEXT" | "CODE";
    reward: number;
    deadline: string;
    status: "OPEN" | "JUDGING" | "PAYMENT_PENDING" | "COMPLETED" | "CANCELLED";
    creator: {
      id: string;
      name: string | null;
      walletAddress: string;
      avatarUrl: string | null;
    };
    _count: {
      submissions: number;
    };
  };
  rank?: number;
  compact?: boolean;
}

const categoryLabels: Record<string, string> = {
  THREAD: "Thread",
  MEME: "Meme",
  LOGO: "Logo",
  DESIGN: "Design",
  UI_UX: "UI/UX",
  ARTICLE: "Article",
  DOCUMENTATION: "Docs",
  CODE: "Code",
  APP: "App",
  SMART_CONTRACT: "Contract",
  MARKETING: "Marketing",
  VIDEO: "Video",
  OTHER: "Other",
};

const statusColors: Record<string, string> = {
  OPEN: "text-primary",
  JUDGING: "text-yellow-400",
  PAYMENT_PENDING: "text-orange-400",
  COMPLETED: "text-muted",
  CANCELLED: "text-red-400",
};

export function TaskCard({ task, rank, compact = false }: TaskCardProps) {
  // Row-style card matching bags.fm aesthetic
  return (
    <Link href={`/tasks/${task.id}`}>
      <div className="flex items-center gap-4 px-4 py-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors">
        {/* Rank */}
        {rank !== undefined && (
          <div className="w-8 text-center text-muted text-sm shrink-0">
            {rank}
          </div>
        )}

        {/* Avatar */}
        {task.creator.avatarUrl ? (
          <img
            src={task.creator.avatarUrl}
            alt=""
            className="w-10 h-10 rounded-full shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm text-white font-medium shrink-0">
            {(task.creator.name || task.creator.walletAddress)[0].toUpperCase()}
          </div>
        )}

        {/* Task Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-white font-medium text-sm truncate">
              {task.title}
            </h3>
            {task.type === "DAILY" && (
              <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded font-medium shrink-0">
                DAILY
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>{task.creator.name || truncateAddress(task.creator.walletAddress)}</span>
            <span>·</span>
            <span>{categoryLabels[task.category]}</span>
            <span className={`hidden sm:inline ${statusColors[task.status]}`}>
              · {task.status === "OPEN" ? "Open" : task.status === "JUDGING" ? "Reviewing" : task.status.toLowerCase()}
            </span>
          </div>
        </div>

        {/* Stats - Desktop */}
        <div className="hidden md:flex items-center gap-8 shrink-0">
          <div className="text-center">
            <p className="text-white text-sm font-medium">{task._count.submissions}</p>
            <p className="text-[10px] text-muted uppercase">Subs</p>
          </div>
          <div className="text-center">
            <p className="text-muted-light text-sm">{formatRelativeTime(task.deadline)}</p>
            <p className="text-[10px] text-muted uppercase">Deadline</p>
          </div>
        </div>

        {/* Reward */}
        <div className="text-right shrink-0">
          <p className="text-primary font-semibold text-sm sm:text-base">
            ${formatUsdc(task.reward)}
          </p>
          <p className="text-[10px] text-muted sm:hidden">
            {task._count.submissions} subs
          </p>
        </div>
      </div>
    </Link>
  );
}

// Alternative compact card for grids
export function TaskCardCompact({ task }: { task: TaskCardProps["task"] }) {
  return (
    <Link href={`/tasks/${task.id}`}>
      <div className="p-4 border border-white/5 rounded-lg hover:bg-white/[0.02] hover:border-white/10 transition-all">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {task.creator.avatarUrl ? (
              <img
                src={task.creator.avatarUrl}
                alt=""
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white font-medium">
                {(task.creator.name || task.creator.walletAddress)[0].toUpperCase()}
              </div>
            )}
            <span className="text-xs text-muted">
              {task.creator.name || truncateAddress(task.creator.walletAddress)}
            </span>
          </div>
          <span className="text-primary font-semibold text-sm">
            ${formatUsdc(task.reward)}
          </span>
        </div>

        <h3 className="text-white font-medium text-sm mb-1 line-clamp-1">
          {task.title}
        </h3>
        <p className="text-muted text-xs line-clamp-2 mb-3">
          {task.description}
        </p>

        <div className="flex items-center justify-between text-xs text-muted">
          <span>{task._count.submissions} submissions</span>
          <span>{formatRelativeTime(task.deadline)}</span>
        </div>
      </div>
    </Link>
  );
}
