"use client";

import React from "react";
import { truncateAddress, formatRelativeTime } from "@/lib/utils";

interface Submission {
  id: string;
  content: string;
  type: "LINK" | "IMAGE" | "TEXT";
  score: number | null;
  isWinner: boolean;
  aiReasoning: string | null;
  createdAt: string;
  submitter: {
    id: string;
    name: string | null;
    walletAddress: string;
    avatarUrl: string | null;
  };
}

interface SubmissionListProps {
  submissions: Submission[];
  showScores?: boolean;
}

export function SubmissionList({ submissions, showScores = false }: SubmissionListProps) {
  if (submissions.length === 0) {
    return (
      <div className="text-center py-8 text-muted">
        No submissions yet. Be the first to submit!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {submissions.map((submission) => (
        <div
          key={submission.id}
          className={`p-4 rounded-lg border transition-colors ${
            submission.isWinner
              ? "bg-primary/5 border-primary/20"
              : "bg-white/[0.02] border-white/5"
          }`}
        >
          <div className="flex items-start gap-3">
            {/* Avatar */}
            {submission.submitter.avatarUrl ? (
              <img
                src={submission.submitter.avatarUrl}
                alt=""
                className="w-10 h-10 rounded-full shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm text-white font-medium shrink-0">
                {(submission.submitter.name || submission.submitter.walletAddress)[0].toUpperCase()}
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-white text-sm">
                  {submission.submitter.name ||
                    truncateAddress(submission.submitter.walletAddress)}
                </span>
                {submission.isWinner && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-medium rounded">
                    WINNER
                  </span>
                )}
                {showScores && submission.score !== null && (
                  <span className="px-2 py-0.5 bg-white/5 text-muted-light text-[10px] font-medium rounded">
                    Score: {submission.score}
                  </span>
                )}
              </div>

              {/* Content */}
              {submission.type === "LINK" ? (
                <a
                  href={submission.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm hover:underline break-all"
                >
                  {submission.content}
                </a>
              ) : submission.type === "IMAGE" ? (
                <img
                  src={submission.content}
                  alt="Submission"
                  className="max-w-full max-h-64 rounded-lg mt-2"
                />
              ) : (
                <p className="text-muted-light text-sm whitespace-pre-wrap mt-1">
                  {submission.content}
                </p>
              )}

              {/* Reasoning */}
              {showScores && submission.aiReasoning && (
                <p className="text-xs text-muted mt-3 italic border-l-2 border-white/10 pl-3">
                  {submission.aiReasoning}
                </p>
              )}

              {/* Timestamp */}
              <p className="text-[10px] text-muted mt-2">
                {formatRelativeTime(submission.createdAt)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
