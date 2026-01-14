"use client";

import React from "react";
import { motion } from "framer-motion";
import { TaskCard } from "./TaskCard";
import { Spinner } from "@/components/ui/Spinner";

interface Task {
  id: string;
  title: string;
  description: string;
  type: "DAILY" | "CUSTOM";
  category: "THREAD" | "MEME" | "LOGO" | "DESIGN" | "UI_UX" | "ARTICLE" | "DOCUMENTATION" | "CODE" | "APP" | "SMART_CONTRACT" | "MARKETING" | "VIDEO" | "OTHER";
  submissionType: "LINK" | "CODE" | "IMAGE" | "TEXT";
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

interface TaskListProps {
  tasks: Task[];
  isLoading?: boolean;
  emptyMessage?: string;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function TaskList({
  tasks,
  isLoading = false,
  emptyMessage = "No tasks found",
}: TaskListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {tasks.map((task) => (
        <motion.div key={task.id} variants={itemVariants}>
          <TaskCard task={task} />
        </motion.div>
      ))}
    </motion.div>
  );
}
