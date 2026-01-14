"use client";

import React, { useEffect, useState, useMemo } from "react";
import { formatUsdc, truncateAddress } from "@/lib/utils";

interface LeaderboardUser {
  id: string;
  walletAddress: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  totalEarnings: number;
  wins: number;
  totalSubmissions: number;
  tasksCreated: number;
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch("/api/leaderboard?limit=100");
      if (response.ok) {
        const data = await response.json();
        setUsers(data.leaderboard);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.walletAddress.toLowerCase().includes(query) ||
        (user.name && user.name.toLowerCase().includes(query))
    );
  }, [users, searchQuery]);

  // Show top 10 or all based on showAll state
  const displayedUsers = showAll ? filteredUsers : filteredUsers.slice(0, 10);

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <main className="flex-1 pt-14">
        {/* Page Header - bags.fm style */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Leaderboard
            </h1>
            <p className="text-muted-light mb-6">
              Top bread winners
            </p>
            
            {/* Search Bar */}
            <div className="max-w-md mx-auto">
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
                  placeholder="Search by name or wallet..."
                  className="w-full bg-white/5 border border-white/10 rounded-full py-2.5 pl-10 pr-4 text-sm text-white placeholder-muted focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="max-w-5xl mx-auto">
          {/* Table Header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-8 py-3 text-xs text-muted uppercase tracking-wider border-b border-white/5">
            <div className="col-span-1">#</div>
            <div className="col-span-5">User</div>
            <div className="col-span-2 text-center">Wins</div>
            <div className="col-span-2 text-center">Submissions</div>
            <div className="col-span-2 text-right">Earnings</div>
          </div>

          {/* Users */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted">
                {searchQuery ? "No users found matching your search." : "No winners yet. Be the first!"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {displayedUsers.map((user, index) => (
                <div
                  key={user.id}
                  className="grid grid-cols-12 gap-4 px-4 sm:px-8 py-4 items-center hover:bg-white/[0.02] transition-colors"
                >
                  {/* Rank */}
                  <div className="col-span-1">
                    {index < 3 ? (
                      <span className="text-lg">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                      </span>
                    ) : (
                      <span className="text-muted text-sm">{index + 1}</span>
                    )}
                  </div>

                  {/* User Info */}
                  <div className="col-span-7 sm:col-span-5 flex items-center gap-3">
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt=""
                        className="w-10 h-10 rounded-full shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm text-white font-medium shrink-0">
                        {(user.name || user.walletAddress)[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {user.name || truncateAddress(user.walletAddress)}
                      </p>
                      {user.name && (
                        <p className="text-xs text-muted font-mono truncate">
                          {truncateAddress(user.walletAddress)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Wins - Desktop */}
                  <div className="hidden sm:block col-span-2 text-center">
                    <span className="text-muted-light text-sm">{user.wins}</span>
                  </div>

                  {/* Submissions - Desktop */}
                  <div className="hidden sm:block col-span-2 text-center">
                    <span className="text-muted text-sm">{user.totalSubmissions}</span>
                  </div>

                  {/* Earnings */}
                  <div className="col-span-4 sm:col-span-2 text-right">
                    <span className="text-primary font-semibold text-sm sm:text-base">
                      ${formatUsdc(user.totalEarnings)}
                    </span>
                    <p className="text-[10px] text-muted sm:hidden">
                      {user.wins} wins
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Show More Button */}
          {!isLoading && filteredUsers.length > 10 && !searchQuery && (
            <div className="py-6 text-center border-t border-white/5">
              <button
                onClick={() => setShowAll(!showAll)}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm text-white transition-colors"
              >
                {showAll ? "Show Top 10" : `Show All (${filteredUsers.length})`}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
