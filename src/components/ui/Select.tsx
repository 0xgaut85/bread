"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            "w-full px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg",
            "text-white text-sm",
            "focus:outline-none focus:border-primary transition-colors",
            "appearance-none cursor-pointer",
            error && "border-red-500/50 focus:border-red-500",
            className
          )}
          style={{
            backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b6b6b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
            backgroundPosition: "right 0.75rem center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "1.25em 1.25em",
          }}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} className="bg-black text-white">
              {option.label}
            </option>
          ))}
        </select>
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      </div>
    );
  }
);

Select.displayName = "Select";
