"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { formatUsdc, formatRelativeTime, truncateAddress } from "@/lib/utils";

// Scrambling number component - slow, cinematic effect
function ScrambleNumber({ value, prefix = "$" }: { value: number; prefix?: string }) {
  const [displayValue, setDisplayValue] = useState("0.00");
  const [isScrambling, setIsScrambling] = useState(true);
  
  useEffect(() => {
    const targetValue = value.toFixed(2);
    const scrambleChars = "0123456789";
    
    // Slow scramble: change numbers every 80ms for 4 seconds, then reveal one by one
    const scrambleInterval = 80; // ms between each number change (slower = more readable)
    const totalScrambleTime = 4000; // 4 seconds of scrambling
    const revealDelay = 300; // ms between revealing each digit
    
    let scrambleCount = 0;
    const maxScrambles = totalScrambleTime / scrambleInterval;
    
    // Scrambling phase
    const scrambleTimer = setInterval(() => {
      scrambleCount++;
      
      if (scrambleCount >= maxScrambles) {
        clearInterval(scrambleTimer);
        // Start reveal phase
        revealDigits();
        return;
      }
      
      const scrambled = targetValue
        .split("")
        .map((char) => {
          if (char === "." || char === ",") return char;
          return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
        })
        .join("");
      setDisplayValue(scrambled);
    }, scrambleInterval);
    
    // Reveal phase - reveal one digit at a time
    const revealDigits = () => {
      let revealIndex = 0;
      const digits = targetValue.split("");
      
      const revealTimer = setInterval(() => {
        if (revealIndex >= digits.length) {
          clearInterval(revealTimer);
          setDisplayValue(targetValue);
          setIsScrambling(false);
          return;
        }
        
        const revealed = digits
          .map((char, i) => {
            if (i <= revealIndex) return char;
            if (char === "." || char === ",") return char;
            return scrambleChars[Math.floor(Math.random() * scrambleChars.length)];
          })
          .join("");
        setDisplayValue(revealed);
        revealIndex++;
      }, revealDelay);
    };
    
    return () => {
      clearInterval(scrambleTimer);
    };
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
      <main className="flex-1 pt-28 sm:pt-32">
        {/* Hero Section - Full Width */}
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            {/* Hero Content */}
            <div className="text-center py-12 sm:py-16 lg:py-20">
              <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight leading-none">
                welcome to bread
              </h1>
              <p className="text-xl sm:text-2xl text-muted-light max-w-2xl mx-auto mb-10">
                complete tasks, earn USDC, and stack bread.
              </p>
              
              {/* Rewards Display - Prominent */}
              <div className="mb-12">
                <p className="text-sm sm:text-base text-muted uppercase tracking-widest mb-3">
                  rewards available
                </p>
                <div className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold text-primary tabular-nums leading-none">
                  <ScrambleNumber value={data.stats.totalRewards} />
                </div>
                <p className="text-muted-light text-lg mt-3">USDC</p>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link href="/tasks">
                  <button className="px-8 py-4 bg-primary text-black font-semibold text-lg rounded-full hover:bg-[#00e63e] transition-colors">
                    Browse Tasks
                  </button>
                </Link>
                <Link href="/tasks/create">
                  <button className="px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold text-lg rounded-full hover:bg-white/10 transition-colors">
                    Create Task
                  </button>
                </Link>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 py-8 border-t border-white/5">
              <div className="text-center p-4">
                <p className="text-3xl sm:text-4xl font-bold text-white">{data.stats.openTasks}</p>
                <p className="text-sm text-muted mt-1">Open Tasks</p>
              </div>
              <div className="text-center p-4">
                <p className="text-3xl sm:text-4xl font-bold text-white">{data.stats.totalSubmissions}</p>
                <p className="text-sm text-muted mt-1">Submissions</p>
              </div>
              <div className="text-center p-4">
                <p className="text-3xl sm:text-4xl font-bold text-primary">${formatUsdc(data.stats.totalRewards)}</p>
                <p className="text-sm text-muted mt-1">Total Rewards</p>
              </div>
              <div className="text-center p-4">
                <p className="text-3xl sm:text-4xl font-bold text-white">{data.tasks.length}</p>
                <p className="text-sm text-muted mt-1">Active</p>
              </div>
            </div>

            {/* Task List Section */}
            <div className="py-8 sm:py-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-white">Latest Tasks</h2>
                <Link href="/tasks" className="text-primary hover:text-[#00e63e] transition-colors text-sm sm:text-base">
                  View all →
                </Link>
              </div>

              {/* Task Table */}
              <div className="border border-white/10 rounded-xl overflow-hidden">
                {/* Table Header */}
                <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-4 text-xs text-muted uppercase tracking-wider bg-white/[0.02] border-b border-white/5">
                  <div className="col-span-1">#</div>
                  <div className="col-span-4">Task</div>
                  <div className="col-span-2">Creator</div>
                  <div className="col-span-2 text-right">Submissions</div>
                  <div className="col-span-2 text-right">Deadline</div>
                  <div className="col-span-1 text-right">Reward</div>
                </div>

                {/* Task Rows */}
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : data.tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <p className="text-muted text-lg mb-4">No tasks yet</p>
                    <Link href="/tasks/create">
                      <button className="btn-primary">Create the first one</button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {data.tasks.slice(0, 8).map((task, index) => (
                      <Link
                        key={task.id}
                        href={`/tasks/${task.id}`}
                        className="grid grid-cols-12 gap-4 px-4 sm:px-6 py-5 items-center hover:bg-white/[0.02] transition-colors"
                      >
                        {/* Rank */}
                        <div className="col-span-1 text-muted text-base font-medium">
                          {index + 1}
                        </div>

                        {/* Task Info */}
                        <div className="col-span-11 sm:col-span-4">
                          <div className="flex items-center gap-4">
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
                            <div className="min-w-0">
                              <p className="text-white font-medium text-base truncate">
                                {task.title}
                              </p>
                              <p className="text-muted text-sm truncate sm:hidden">
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
                          <span className="text-muted-light text-base">
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
                          <span className="text-primary font-bold text-base">
                            ${formatUsdc(task.reward)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
