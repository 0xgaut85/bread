"use client";

import React from "react";
import Link from "next/link";
import { TaskForm } from "@/components/tasks/TaskForm";

export default function CreateTaskPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pt-14">
        {/* Back Link */}
        <div className="border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
            <Link href="/tasks" className="text-sm text-muted hover:text-white transition-colors">
              ← Back to tasks
            </Link>
          </div>
        </div>

        {/* Page Header */}
        <div className="border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Create Task
            </h1>
            <p className="text-muted-light">
              Set up a new task for the community
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6 sm:p-8">
            <TaskForm />
          </div>
        </div>
      </main>
    </div>
  );
}
