"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { WalletButton } from "@/components/wallet/WalletButton";
import { useAuth } from "@/components/providers/AuthProvider";

export function Header() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/tasks?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background border-b border-white/5">
      <div className="w-full px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <Image
              src="/logo.png"
              alt="Bread"
              width={28}
              height={28}
              className="w-7 h-7"
            />
          </Link>

          {/* Search Bar - bags.fm style */}
          <form onSubmit={handleSearch} className="flex-1 max-w-md hidden sm:block">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks"
                className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-muted focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>
          </form>

          {/* Right Side - Links and Buttons */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Text Links - bags.fm style with brackets */}
            <Link
              href="/tasks"
              className="hidden md:block text-sm text-muted-light hover:text-white transition-colors"
            >
              [get bread]
            </Link>
            <Link
              href="/leaderboard"
              className="hidden md:block text-sm text-muted-light hover:text-white transition-colors"
            >
              [leaderboard]
            </Link>
            <Link
              href="/docs"
              className="hidden md:block text-sm text-muted-light hover:text-white transition-colors"
            >
              [how it works]
            </Link>
            <a
              href="https://pump.fun/coin/A7krRnGBJZxmjBseFFrk6L9EMmQpPTdWd612mqkcpump"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:block text-sm text-primary hover:text-[#00e63e] transition-colors"
            >
              [CA]
            </a>

            {/* Profile Button - only show when authenticated */}
            {isAuthenticated && (
              <Link
                href="/profile"
                className="hidden md:block text-sm text-muted-light hover:text-white transition-colors"
              >
                [profile]
              </Link>
            )}

            {/* New Task Button - bags.fm green style */}
            <Link href="/tasks/create">
              <button className="flex items-center gap-1.5 bg-primary text-black font-semibold text-sm px-4 py-2 rounded-full hover:bg-[#00e63e] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">new task</span>
              </button>
            </Link>

            {/* Wallet Button */}
            <WalletButton />
          </div>
        </div>
      </div>
    </header>
  );
}
