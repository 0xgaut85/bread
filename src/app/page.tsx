"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatUsdc, formatRelativeTime, truncateAddress } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description: string;
  type: "DAILY" | "CUSTOM";
  category: string;
  submissionType: string;
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
}

interface DashboardData {
  stats: {
    totalTasks: number;
    openTasks: number;
    totalRewards: number;
    totalSubmissions: number;
  };
  tasks: Task[];
}

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<DashboardData>({
    stats: { totalTasks: 0, openTasks: 0, totalRewards: 0, totalSubmissions: 0 },
    tasks: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const tickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await fetch("/api/tasks?limit=20&status=OPEN");
      if (response.ok) {
        const tasksData = await response.json();
        const allTasks: Task[] = tasksData.tasks || [];
        const totalRewards = allTasks.reduce((sum: number, t: Task) => sum + t.reward, 0);
        const totalSubmissions = allTasks.reduce((sum: number, t: Task) => sum + t._count.submissions, 0);

        setData({
          stats: {
            totalTasks: tasksData.pagination?.total || 0,
            openTasks: allTasks.length,
            totalRewards,
            totalSubmissions,
          },
          tasks: allTasks,
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Create ticker items
  const tickerItems = data.tasks.slice(0, 10);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Scrolling Ticker - bags.fm style */}
      {tickerItems.length > 0 && (
        <div className="fixed top-14 left-0 right-0 z-40 ticker-container">
          <div className="ticker-content" ref={tickerRef}>
            {[...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems].map((task, index) => (
              <Link
                key={`${task.id}-${index}`}
                href={`/tasks/${task.id}`}
                className="flex items-center gap-3 px-6 py-2 shrink-0 hover:bg-white/5 transition-colors"
              >
                {task.creator.avatarUrl ? (
                  <img
                    src={task.creator.avatarUrl}
                    alt=""
                    className="w-5 h-5 rounded-full"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold">
                    {(task.creator.name || task.creator.walletAddress)[0].toUpperCase()}
                  </div>
                )}
                <span className="text-white text-sm font-medium whitespace-nowrap">
                  {task.title.length > 20 ? task.title.slice(0, 20) + "..." : task.title}
                </span>
                <span className="text-primary text-sm font-semibold whitespace-nowrap">
                  +${formatUsdc(task.reward)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 pt-24 pb-8">
        {/* Hero Section - bags.fm style */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          {/* Stats Badge */}
          <div className="stats-badge mb-6 inline-flex">
            <span>${formatUsdc(data.stats.totalRewards)}+</span>
            <span className="text-muted-light">in rewards available</span>
          </div>

          {/* Main Headline */}
          <h1 className="text-4xl sm:text-6xl font-bold text-white mb-4 tracking-tight">
            Welcome to Bread
          </h1>

          {/* Subtitle */}
          <p className="text-lg sm:text-xl text-muted-light mb-8 max-w-lg mx-auto">
            Complete tasks, earn USDC, and stack bread.
          </p>

          {/* CTA Button */}
          <Link href="/tasks/create">
            <button className="btn-primary text-base px-8 py-3">
              + new task
            </button>
          </Link>
        </div>

        {/* Task List - bags.fm table style */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-4 py-3 text-xs text-muted uppercase tracking-wider border-b border-white/10">
            <div className="col-span-1">#</div>
            <div className="col-span-4">Task</div>
            <div className="col-span-2">Creator</div>
            <div className="col-span-2 text-right">Submissions</div>
            <div className="col-span-2 text-right">Deadline</div>
            <div className="col-span-1 text-right">Reward</div>
          </div>

          {/* Task Rows */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data.tasks.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted mb-4">No tasks yet</p>
              <Link href="/tasks/create">
                <button className="btn-primary">Create the first one</button>
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.tasks.map((task, index) => (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="grid grid-cols-12 gap-4 px-4 py-4 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Rank */}
                  <div className="col-span-1 text-muted text-sm">
                    {index + 1}
                  </div>

                  {/* Task Info */}
                  <div className="col-span-11 sm:col-span-4">
                    <div className="flex items-center gap-3">
                      {task.creator.avatarUrl ? (
                        <img
                          src={task.creator.avatarUrl}
                          alt=""
                          className="w-8 h-8 rounded-full shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white font-medium shrink-0">
                          {(task.creator.name || task.creator.walletAddress)[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-white font-medium text-sm truncate">
                          {task.title}
                        </p>
                        <p className="text-muted text-xs truncate sm:hidden">
                          {task.creator.name || truncateAddress(task.creator.walletAddress)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Creator - Desktop */}
                  <div className="hidden sm:block col-span-2">
                    <span className="text-muted-light text-sm truncate">
                      {task.creator.name || truncateAddress(task.creator.walletAddress)}
                    </span>
                  </div>

                  {/* Submissions - Desktop */}
                  <div className="hidden sm:block col-span-2 text-right">
                    <span className="text-muted-light text-sm">
                      {task._count.submissions}
                    </span>
                  </div>

                  {/* Deadline - Desktop */}
                  <div className="hidden sm:block col-span-2 text-right">
                    <span className="text-muted text-sm">
                      {formatRelativeTime(task.deadline)}
                    </span>
                  </div>

                  {/* Reward - Desktop */}
                  <div className="hidden sm:block col-span-1 text-right">
                    <span className="text-primary font-semibold text-sm">
                      ${formatUsdc(task.reward)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* View All Link */}
          {data.tasks.length > 0 && (
            <div className="text-center py-8">
              <Link
                href="/tasks"
                className="text-sm text-muted hover:text-white transition-colors"
              >
                View all tasks →
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
