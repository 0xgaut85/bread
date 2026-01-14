"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { formatUsdc, formatRelativeTime, truncateAddress } from "@/lib/utils";

interface Transaction {
  id: string;
  type: "LOCK" | "RELEASE";
  amount: number;
  fromWallet: string;
  toWallet: string;
  status: "PENDING" | "CONFIRMED" | "FAILED";
  txSignature: string | null;
  createdAt: string;
  task: {
    id: string;
    title: string;
  };
  submission?: {
    aiReasoning: string | null;
    submitter: {
      walletAddress: string;
      name: string | null;
    };
  } | null;
}

interface Totals {
  type: string;
  status: string;
  _sum: { amount: number | null };
}

interface TaskStats {
  locked: number;
  lockedCount: number;
  released: number;
  releasedCount: number;
}

interface CompletedTask {
  id: string;
  title: string;
  reward: number;
  updatedAt: string;
  winner: {
    walletAddress: string;
    name: string | null;
  } | null;
  aiReasoning: string | null;
}

export function EscrowStatus() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totals, setTotals] = useState<Totals[]>([]);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);
  const [completedTasks, setCompletedTasks] = useState<CompletedTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAllReleased, setShowAllReleased] = useState(false);
  const [showAllPending, setShowAllPending] = useState(false);

  useEffect(() => {
    fetchEscrowData();
    fetchCompletedTasks();
  }, []);

  const fetchEscrowData = async () => {
    try {
      const response = await fetch("/api/escrow");
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
        setTotals(data.stats || []);
        setTaskStats(data.taskStats || null);
      }
    } catch (error) {
      console.error("Failed to fetch escrow data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCompletedTasks = async () => {
    try {
      const response = await fetch("/api/tasks?status=COMPLETED&limit=50");
      if (response.ok) {
        const data = await response.json();
        const tasks = (data.tasks || []).map((task: any) => {
          const winnerSubmission = task.submissions?.find((s: any) => s.isWinner);
          return {
            id: task.id,
            title: task.title,
            reward: task.reward,
            updatedAt: task.updatedAt,
            winner: winnerSubmission?.submitter || null,
            aiReasoning: winnerSubmission?.aiReasoning || null,
          };
        });
        setCompletedTasks(tasks);
      }
    } catch (error) {
      console.error("Failed to fetch completed tasks:", error);
    }
  };

  // Use task-based stats if available, otherwise fall back to transaction-based
  const locked = taskStats?.locked || 0;
  const released = taskStats?.released || 0;
  const balance = locked; // Balance is what's still locked (pending payout)

  // Separate released and pending transactions
  const releasedTxs = transactions.filter(
    (tx) => tx.type === "RELEASE" && tx.status === "CONFIRMED"
  );
  const pendingTxs = transactions.filter(
    (tx) => tx.type === "RELEASE" && tx.status === "PENDING"
  );
  
  // Get task IDs that have been released (paid out)
  const releasedTaskIds = new Set(releasedTxs.map((tx) => tx.task.id));
  
  // Only show LOCK transactions for tasks that haven't been released yet
  const lockTxs = transactions.filter(
    (tx) => tx.type === "LOCK" && !releasedTaskIds.has(tx.task.id)
  );

  const displayedReleased = showAllReleased ? releasedTxs : releasedTxs.slice(0, 10);
  const displayedPending = showAllPending ? [...pendingTxs, ...lockTxs] : [...pendingTxs, ...lockTxs].slice(0, 10);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid gap-4 grid-cols-3">
        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Locked</p>
          <p className="text-lg font-semibold text-white">${formatUsdc(locked)}</p>
        </div>
        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Released</p>
          <p className="text-lg font-semibold text-primary">${formatUsdc(released)}</p>
        </div>
        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-4 text-center">
          <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Pending</p>
          <p className="text-lg font-semibold text-white">${formatUsdc(balance)}</p>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
        {/* Left: Released Payments */}
        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <h3 className="font-medium text-white text-sm">Released Payments</h3>
            </div>
            <span className="text-xs text-muted">{releasedTxs.length} total</span>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {releasedTxs.length === 0 ? (
              <p className="text-center text-muted py-8 text-sm">
                No payments released yet
              </p>
            ) : (
              <div className="divide-y divide-white/5">
                {displayedReleased.map((tx) => (
                  <div
                    key={tx.id}
                    className="px-6 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <Link href={`/tasks/${tx.task.id}`} className="hover:text-primary transition-colors">
                          <p className="font-medium text-white text-sm truncate">{tx.task.title}</p>
                        </Link>
                        <p className="text-xs text-muted">
                          → {truncateAddress(tx.toWallet)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-sm text-primary">
                          ${formatUsdc(tx.amount)}
                        </p>
                        <p className="text-[10px] text-muted">
                          {formatRelativeTime(tx.createdAt)}
                        </p>
                      </div>
                    </div>
                    {tx.txSignature && (
                      <a
                        href={`https://solscan.io/tx/${tx.txSignature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-2 inline-block"
                      >
                        View on Solscan →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            {releasedTxs.length > 10 && !showAllReleased && (
              <div className="p-4 border-t border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAllReleased(true)}
                >
                  Show {releasedTxs.length - 10} more
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Completed Tasks with Winner Selection */}
        <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-yellow-400" />
              <h3 className="font-medium text-white text-sm">Winners</h3>
            </div>
            <span className="text-xs text-muted">{completedTasks.length} completed</span>
          </div>
          <div className="max-h-[50vh] overflow-y-auto">
            {completedTasks.length === 0 ? (
              <p className="text-center text-muted py-8 text-sm">
                No completed tasks yet
              </p>
            ) : (
              <div className="divide-y divide-white/5">
                {(showAllPending ? completedTasks : completedTasks.slice(0, 10)).map((task) => (
                  <div
                    key={task.id}
                    className="px-6 py-4 hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0 flex-1">
                        <Link href={`/tasks/${task.id}`} className="hover:text-primary transition-colors">
                          <p className="font-medium text-white text-sm truncate">{task.title}</p>
                        </Link>
                        <p className="text-xs text-muted">
                          Winner: {task.winner?.name || truncateAddress(task.winner?.walletAddress || "")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium text-sm text-primary">
                          ${formatUsdc(task.reward)}
                        </p>
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded">
                          PAID
                        </span>
                      </div>
                    </div>
                    
                    {/* Why they won */}
                    {task.aiReasoning && (
                      <div className="mt-3 p-3 bg-white/[0.02] rounded-lg border border-white/5">
                        <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Why they won</p>
                        <p className="text-xs text-muted-light line-clamp-3">
                          {task.aiReasoning}
                        </p>
                      </div>
                    )}
                    
                    <p className="text-[10px] text-muted mt-2">
                      {formatRelativeTime(task.updatedAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
            {completedTasks.length > 10 && !showAllPending && (
              <div className="p-4 border-t border-white/5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => setShowAllPending(true)}
                >
                  Show {completedTasks.length - 10} more
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
