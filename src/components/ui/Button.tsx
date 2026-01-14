"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      isLoading = false,
      disabled = false,
      className,
      type = "button",
      onClick,
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-semibold rounded-full transition-all duration-150 focus:outline-none";

    const variantStyles = {
      primary: "bg-primary text-black hover:bg-[#00e63e] active:scale-[0.98]",
      secondary: "bg-transparent text-white border border-white/20 hover:bg-white/5 hover:border-white/30 active:scale-[0.98]",
      ghost: "bg-transparent text-muted hover:text-white hover:bg-white/5",
      danger: "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
    };

    const sizeStyles = {
      sm: "px-4 py-2 text-xs",
      md: "px-5 py-2.5 text-sm",
      lg: "px-7 py-3 text-sm",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        onClick={onClick}
        className={cn(
          baseStyles,
          variantStyles[variant],
          sizeStyles[size],
          (disabled || isLoading) && "opacity-50 cursor-not-allowed",
          className
        )}
      >
        {isLoading ? (
          <span className="animate-spin h-4 w-4 border-2 border-current border-r-transparent rounded-full" />
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
