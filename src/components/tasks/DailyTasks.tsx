"use client";

import React, { useEffect, useState } from "react";
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

export function DailyTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDailyTasks();
  }, []);

  const fetchDailyTasks = async () => {
    try {
      const response = await fetch("/api/tasks/daily");
      if (response.ok) {
        const data = await response.json();
        setTasks(data.tasks);
      }
    } catch (error) {
      console.error("Failed to fetch daily tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 px-4 bg-neutral-50 rounded-2xl">
        <p className="text-neutral-500">No daily tasks available today</p>
        <p className="text-sm text-neutral-400 mt-1">Check back tomorrow!</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2"
    >
      {tasks.map((task, index) => (
        <motion.div
          key={task.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          <TaskCard task={task} />
        </motion.div>
      ))}
    </motion.div>
  );
}
