"use client";

import React, { useState, useRef } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";

interface SubmissionFormProps {
  taskId: string;
  submissionType: "LINK" | "IMAGE" | "TEXT";
  onSuccess?: () => void;
}

export function SubmissionForm({ taskId, submissionType, onSuccess }: SubmissionFormProps) {
  const { isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isAuthenticated) {
      setError("Please connect your wallet first");
      return;
    }

    setIsLoading(true);

    try {
      let submissionContent = content;

      // Upload image if submissionType is IMAGE
      if (submissionType === "IMAGE" && file) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadResponse.ok) {
          throw new Error("Failed to upload image");
        }

        const { url } = await uploadResponse.json();
        submissionContent = url;
      }

      if (!submissionContent) {
        throw new Error("Please provide your submission");
      }

      const response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          content: submissionContent,
          type: submissionType,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit");
      }

      setContent("");
      setFile(null);
      setPreview(null);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setIsLoading(false);
    }
  };

  const renderSubmissionInput = () => {
    switch (submissionType) {
      case "LINK":
        return (
          <Input
            label="Link / URL"
            type="url"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="https://github.com/..., https://x.com/..., https://yourapp.com/..."
            required
          />
        );
      
      case "TEXT":
        return (
          <Textarea
            label="Your Submission"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Describe your work, paste code, or provide details..."
            rows={6}
            required
          />
        );
      
      case "IMAGE":
        return (
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wider mb-2">
              Upload Image
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-white/10 rounded-lg p-6 text-center cursor-pointer hover:border-white/20 transition-colors"
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-48 mx-auto rounded-lg"
                />
              ) : (
                <div className="text-muted">
                  <p className="text-sm">Click to upload an image</p>
                  <p className="text-xs mt-1">JPEG, PNG, GIF, WebP (max 2MB)</p>
                </div>
              )}
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  const getSubmissionHint = () => {
    switch (submissionType) {
      case "LINK":
        return "Submit any URL: GitHub repo, deployed app, tweet, article, etc.";
      case "TEXT":
        return "Provide a text description, code snippet, or detailed response.";
      case "IMAGE":
        return "Upload an image of your work (meme, design, screenshot, etc.)";
      default:
        return "";
    }
  };

  return (
    <div className="bg-[#0a0a0a] border border-white/5 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-white/5">
        <h3 className="font-semibold text-white">Submit Your Entry</h3>
        <p className="text-xs text-muted mt-1">{getSubmissionHint()}</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          {renderSubmissionInput()}
        </div>

        <div className="px-6 pb-6">
          <Button type="submit" className="w-full" isLoading={isLoading}>
            Submit Entry
          </Button>
        </div>
      </form>
    </div>
  );
}
