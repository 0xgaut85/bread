"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home", icon: "◇" },
  { href: "/tasks", label: "Tasks", icon: "☰" },
  { href: "/leaderboard", label: "Ranks", icon: "★" },
  { href: "/profile", label: "Profile", icon: "○" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-black border-t border-white/5">
      <div className="flex items-center justify-around h-14 px-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 transition-colors",
                  isActive ? "text-primary" : "text-muted"
                )}
              >
                <span className="text-base">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
