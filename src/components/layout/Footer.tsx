"use client";

import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Links - bags.fm style */}
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/docs"
              className="text-muted hover:text-white transition-colors"
            >
              Docs
            </Link>
            <Link
              href="https://github.com/breadmarkets"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-white transition-colors"
            >
              GitHub
            </Link>
            <Link
              href="https://x.com/breadmarkets"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-white transition-colors"
            >
              X
            </Link>
            <Link
              href="https://discord.gg/breadmarkets"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted hover:text-white transition-colors"
            >
              Community
            </Link>
          </div>

          {/* Copyright */}
          <p className="text-sm text-muted">
            © {new Date().getFullYear()} bread.markets
          </p>
        </div>
      </div>
    </footer>
  );
}
