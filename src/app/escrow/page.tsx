"use client";

import React from "react";
import Link from "next/link";
import { EscrowStatus } from "@/components/escrow/EscrowStatus";
import { Footer } from "@/components/layout/Footer";

export default function EscrowPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col">
      <main className="flex-1 pt-14">
        {/* Back Link */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <Link href="/" className="text-sm text-muted hover:text-white transition-colors">
              ← Back to home
            </Link>
          </div>
        </div>

        {/* Page Header */}
        <div className="border-b border-white/5">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center">
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
              Escrow
            </h1>
            <p className="text-muted-light">
              Track locked funds and reward distributions
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <EscrowStatus />
        </div>
      </main>

      <Footer />
    </div>
  );
}
