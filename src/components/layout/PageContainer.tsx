"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
}

export function PageContainer({
  children,
  title,
  subtitle,
  action,
  className,
}: PageContainerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("pt-16 sm:pt-20 pb-20 md:pb-6", className)}
    >
      <div className="w-full px-4 sm:px-6 lg:px-10">
        {(title || action) && (
          <div className="flex items-start justify-between gap-3 mb-3 sm:mb-4">
            <div className="min-w-0">
              {title && (
                <h1 className="text-lg sm:text-xl font-semibold tracking-tight">{title}</h1>
              )}
              {subtitle && (
                <p className="text-xs sm:text-sm text-muted">{subtitle}</p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}
        {children}
      </div>
    </motion.div>
  );
}
