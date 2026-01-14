"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { TaskCard } from "@/components/tasks/TaskCard";
import { useAuth } from "@/components/providers/AuthProvider";

interface Task {
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
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type SortOption = "trending" | "newest" | "ending" | "reward" | "submissions";
type StatusFilter = "" | "OPEN" | "JUDGING" | "COMPLETED";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "New" },
  { value: "ending", label: "Ending Soon" },
  { value: "reward", label: "Top $$$" },
];

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "JUDGING", label: "Reviewing" },
  { value: "COMPLETED", label: "Done" },
];

export default function TasksPage() {
  const { isAuthenticated } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSort, setActiveSort] = useState<SortOption>("trending");
  const [activeStatus, setActiveStatus] = useState<StatusFilter>("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchTasks();
  }, [activeSort, activeStatus, page]);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("sort", activeSort);
      if (activeStatus) params.set("status", activeStatus);

      const response = await fetch(`/api/tasks?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSortChange = (sort: SortOption) => {
    setActiveSort(sort);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pt-14">
        {/* Page Header - bags.fm style */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Tasks
            </h1>
            <p className="text-muted-light">
              Find work, get bread
            </p>
          </div>
        </div>

        {/* Filters - bags.fm style */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {/* Sort Tabs */}
              <div className="tab-nav overflow-x-auto">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleSortChange(option.value)}
                    className={`tab-item whitespace-nowrap ${
                      activeSort === option.value ? "active" : ""
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {/* Status Filter & New Task */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 bg-white/[0.03] border border-white/5 rounded-lg p-1">
                  {statusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      onClick={() => { setActiveStatus(filter.value); setPage(1); }}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                        activeStatus === filter.value
                          ? "bg-white/10 text-white"
                          : "text-muted hover:text-white"
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <Link href="/tasks/create">
                  <button className="btn-primary text-sm px-4 py-2">
                    + New Task
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Task List */}
        <div className="max-w-5xl mx-auto">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-8 py-3 text-xs text-muted uppercase tracking-wider border-b border-white/5">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Task</div>
            <div className="col-span-2 text-center">Submissions</div>
            <div className="col-span-2 text-center">Deadline</div>
            <div className="col-span-2 text-right">Reward</div>
          </div>

          {/* Tasks */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted mb-4">No tasks found</p>
              <Link href="/tasks/create">
                <button className="btn-primary">Create one</button>
              </Link>
            </div>
          ) : (
            <div>
              {tasks.map((task, index) => (
                <TaskCard key={task.id} task={task} rank={index + 1 + (page - 1) * 20} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 py-8 border-t border-white/5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 text-sm text-muted hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ← Previous
              </button>
              <span className="text-sm text-muted">
                {page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="px-4 py-2 text-sm text-muted hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next →
              </button>
            </div>
          )}

          {/* Results count */}
          {pagination && (
            <div className="text-center pb-8">
              <span className="text-xs text-muted">
                {pagination.total} total tasks
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
