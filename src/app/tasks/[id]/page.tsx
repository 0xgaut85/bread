"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { SubmissionForm } from "@/components/submissions/SubmissionForm";
import { SubmissionList } from "@/components/submissions/SubmissionList";
import { useAuth } from "@/components/providers/AuthProvider";
import { formatUsdc, formatRelativeTime, truncateAddress, isDeadlinePassed } from "@/lib/utils";

interface Task {
  id: string;
  title: string;
  description: string;
  type: "DAILY" | "CUSTOM";
  category: "THREAD" | "MEME" | "LOGO" | "DESIGN" | "UI_UX" | "ARTICLE" | "DOCUMENTATION" | "CODE" | "APP" | "SMART_CONTRACT" | "MARKETING" | "VIDEO" | "OTHER";
  submissionType: "LINK" | "IMAGE" | "TEXT";
  reward: number;
  deadline: string;
  status: "OPEN" | "JUDGING" | "PAYMENT_PENDING" | "COMPLETED" | "CANCELLED";
  createdAt: string;
  creator: {
    id: string;
    name: string | null;
    walletAddress: string;
    avatarUrl: string | null;
    xHandle: string | null;
  };
  submissions: Array<{
    id: string;
    content: string;
    type: "LINK" | "IMAGE" | "TEXT";
    score: number | null;
    isWinner: boolean;
    aiReasoning: string | null;
    createdAt: string;
    submitter: {
      id: string;
      name: string | null;
      walletAddress: string;
      avatarUrl: string | null;
    };
  }>;
}

const statusConfig: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "text-primary" },
  JUDGING: { label: "Reviewing", color: "text-yellow-400" },
  PAYMENT_PENDING: { label: "Paying Out", color: "text-orange-400" },
  COMPLETED: { label: "Done", color: "text-muted" },
  CANCELLED: { label: "Cancelled", color: "text-red-400" },
};

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

export default function TaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchTask();
  }, [id]);

  const fetchTask = async () => {
    try {
      const response = await fetch(`/api/tasks/${id}`);
      if (response.ok) {
        const data = await response.json();
        setTask(data.task);
      } else if (response.status === 404) {
        router.push("/tasks");
      }
    } catch (error) {
      console.error("Failed to fetch task:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">Task not found</p>
          <Link href="/tasks">
            <button className="btn-secondary">Back to Tasks</button>
          </Link>
        </div>
      </div>
    );
  }

  const hasSubmitted = task.submissions.some(
    (s) => s.submitter.id === user?.id
  );
  const isCreator = task.creator.id === user?.id;
  const canSubmit =
    isAuthenticated &&
    !isCreator &&
    !hasSubmitted &&
    task.status === "OPEN" &&
    !isDeadlinePassed(task.deadline);

  const statusInfo = statusConfig[task.status];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pt-14">
        {/* Back Link */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <Link href="/tasks" className="text-sm text-muted hover:text-white transition-colors">
              ← Back to tasks
            </Link>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Task Header */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6">
                {/* Meta */}
                <div className="flex items-center gap-3 mb-4 text-sm">
                  {task.type === "DAILY" && (
                    <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-medium">
                      DAILY
                    </span>
                  )}
                  <span className="text-muted">{categoryLabels[task.category]}</span>
                  <span className="text-muted">·</span>
                  <span className={statusInfo.color}>{statusInfo.label}</span>
                </div>

                {/* Title & Reward */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">{task.title}</h1>
                  <div className="sm:text-right shrink-0">
                    <p className="text-3xl font-bold text-primary">${formatUsdc(task.reward)}</p>
                    <p className="text-xs text-muted">USDC reward</p>
                  </div>
                </div>

                {/* Description */}
                <p className="text-muted-light whitespace-pre-wrap leading-relaxed mb-6">
                  {task.description}
                </p>

                {/* Creator */}
                <div className="flex items-center gap-3 pt-6 border-t border-white/5">
                  {task.creator.avatarUrl ? (
                    <img
                      src={task.creator.avatarUrl}
                      alt=""
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm text-white font-medium">
                      {(task.creator.name || task.creator.walletAddress)[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-white">
                      {task.creator.name || truncateAddress(task.creator.walletAddress)}
                    </p>
                    {task.creator.xHandle && (
                      <a
                        href={`https://x.com/${task.creator.xHandle.replace("@", "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {task.creator.xHandle}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Submissions */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                  <h2 className="font-semibold text-white">
                    Submissions ({task.submissions.length})
                  </h2>
                  {task.status === "COMPLETED" && (
                    <span className="text-xs text-muted">Results announced</span>
                  )}
                </div>
                <div className="p-6">
                  <SubmissionList
                    submissions={task.submissions}
                    showScores={task.status === "COMPLETED" || task.status === "PAYMENT_PENDING"}
                  />
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Submit Form */}
              {canSubmit && (
                <SubmissionForm
                  taskId={task.id}
                  submissionType={task.submissionType}
                  onSuccess={fetchTask}
                />
              )}

              {/* Status Messages */}
              {!isAuthenticated && task.status === "OPEN" && (
                <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6 text-center">
                  <p className="text-muted mb-2">Want to submit?</p>
                  <p className="text-sm text-muted">Connect your wallet first</p>
                </div>
              )}

              {isCreator && (
                <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6 text-center">
                  <p className="text-white font-medium mb-1">Your task</p>
                  <p className="text-sm text-muted">You created this one</p>
                </div>
              )}

              {hasSubmitted && !isCreator && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-6 text-center">
                  <p className="text-primary font-medium mb-1">✓ Submitted</p>
                  <p className="text-sm text-muted">Good luck!</p>
                </div>
              )}

              {task.status !== "OPEN" && !hasSubmitted && !isCreator && (
                <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6 text-center">
                  <p className="text-muted">This task is closed</p>
                </div>
              )}

              {/* Task Details */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-white/5">
                  <h3 className="font-semibold text-white">Details</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Deadline</span>
                    <span className="text-white">
                      {formatRelativeTime(task.deadline)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Category</span>
                    <span className="text-white">{categoryLabels[task.category]}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Submit as</span>
                    <span className="text-white">
                      {task.submissionType === "LINK" ? "Link / URL" : 
                       task.submissionType === "IMAGE" ? "Image" : "Text"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Submissions</span>
                    <span className="text-white">{task.submissions.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Created</span>
                    <span className="text-white">
                      {formatRelativeTime(task.createdAt)}
                    </span>
                  </div>
                </div>
              </div>

              {/* How it works */}
              <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6">
                <h3 className="font-medium text-white mb-4">How it works</h3>
                <ol className="space-y-3">
                  {[
                    "Submit your best work",
                    "Wait for deadline",
                    "Best submission wins",
                    "Winner gets USDC"
                  ].map((step, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-sm text-muted-light">
                      <span className="step-number text-xs w-6 h-6">{idx + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
