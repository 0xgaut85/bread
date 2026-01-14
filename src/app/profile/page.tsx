"use client";

import React from "react";
import Link from "next/link";
import { ProfileEditor } from "@/components/profile/ProfileEditor";
import { useAuth } from "@/components/providers/AuthProvider";
import { Footer } from "@/components/layout/Footer";

export default function ProfilePage() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <main className="flex-1 pt-14">
        {/* Back Link */}
        <div className="border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
            <Link href="/" className="text-sm text-muted hover:text-white transition-colors">
              ← Back to home
            </Link>
          </div>
        </div>

        {/* Page Header */}
        <div className="border-b border-white/5">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Profile
            </h1>
            <p className="text-muted-light">
              Manage your account settings
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isAuthenticated ? (
            <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-6 sm:p-8">
              <ProfileEditor />
            </div>
          ) : (
            <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-12 text-center">
              <p className="text-muted">
                Please connect your wallet to view your profile
              </p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
