"use client";

import React, { useEffect, useState } from "react";
import { formatUsdc, truncateAddress } from "@/lib/utils";
import { Footer } from "@/components/layout/Footer";

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

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const response = await fetch("/api/leaderboard");
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

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <main className="flex-1 pt-14">
        {/* Page Header - bags.fm style */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Leaderboard
            </h1>
            <p className="text-muted-light">
              Top bread winners
            </p>
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
          ) : users.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-muted">No winners yet. Be the first!</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {users.map((user, index) => (
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
        </div>
      </main>

      <Footer />
    </div>
  );
}
