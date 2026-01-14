"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { formatUsdc, formatRelativeTime, truncateAddress } from "@/lib/utils";

// Scrambling number component
function ScrambleNumber({ value, prefix = "$" }: { value: number; prefix?: string }) {
  const [displayValue, setDisplayValue] = useState("0.00");
  const [isScrambling, setIsScrambling] = useState(true);
  
  useEffect(() => {
    const targetValue = value.toFixed(2);
    const duration = 2000; // 2 seconds
    const scrambleDuration = 1500; // Scramble for 1.5 seconds
    const startTime = Date.now();
    
    const scrambleChars = "0123456789";
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed < scrambleDuration) {
        // Scrambling phase
        const scrambled = targetValue
          .split("")
          .map((char) => {
            if (char === "." || char === ",") return char;
            return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          })
          .join("");
        setDisplayValue(scrambled);
        requestAnimationFrame(animate);
      } else if (elapsed < duration) {
        // Reveal phase - gradually reveal from left to right
        const progress = (elapsed - scrambleDuration) / (duration - scrambleDuration);
        const revealIndex = Math.floor(progress * targetValue.length);
        
        const revealed = targetValue
          .split("")
          .map((char, i) => {
            if (i <= revealIndex) return char;
            if (char === "." || char === ",") return char;
            return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          })
          .join("");
        setDisplayValue(revealed);
        requestAnimationFrame(animate);
      } else {
        // Final value
        setDisplayValue(targetValue);
        setIsScrambling(false);
      }
    };
    
    requestAnimationFrame(animate);
  }, [value]);
  
  return (
    <span className={isScrambling ? "tabular-nums" : ""}>
      {prefix}{displayValue}
    </span>
  );
}

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
        {/* Hero Section - Split Layout */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 min-h-[300px] sm:min-h-[400px]">
            {/* Left Side - Welcome */}
            <div className="flex flex-col justify-center items-center md:items-start text-center md:text-left px-6 sm:px-12 py-8">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
                welcome to bread
              </h1>
              <p className="text-lg sm:text-xl text-muted-light max-w-md">
                complete tasks, earn USDC, and stack bread.
              </p>
            </div>

            {/* Vertical Separator */}
            <div className="hidden md:block absolute left-1/2 top-1/2 -translate-y-1/2 w-px h-[200px] bg-white/10" style={{ position: 'relative', left: 0, top: 0, transform: 'none', height: '100%' }}>
              <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
            </div>

            {/* Horizontal Separator for Mobile */}
            <div className="md:hidden w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent my-4" />

            {/* Right Side - Reward Amount */}
            <div className="flex flex-col justify-center items-center md:items-end text-center md:text-right px-6 sm:px-12 py-8 md:border-l md:border-white/10">
              <p className="text-sm text-muted uppercase tracking-wider mb-2">
                rewards available
              </p>
              <div className="text-5xl sm:text-6xl lg:text-7xl font-bold text-primary tabular-nums">
                <ScrambleNumber value={data.stats.totalRewards} />
              </div>
              <p className="text-muted-light mt-2">USDC</p>
            </div>
          </div>
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
