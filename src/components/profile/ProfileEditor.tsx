"use client";

import React, { useState, useRef } from "react";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";

export function ProfileEditor() {
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: user?.name || "",
    bio: user?.bio || "",
    xHandle: user?.xHandle || "",
    avatarUrl: user?.avatarUrl || "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    setSuccess(false);
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid file type. Please use JPEG, PNG, GIF, or WebP.");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File too large. Maximum size is 10MB.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const response = await fetch("/api/upload?updateAvatar=true", {
        method: "POST",
        body: uploadFormData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload image");
      }

      const { url } = await response.json();
      
      // Update form data with new avatar URL
      setFormData((prev) => ({
        ...prev,
        avatarUrl: url,
      }));
      
      // Refresh user data since avatar is saved directly
      await refreshUser();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setIsUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await fetch("/api/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update profile");
      }

      await refreshUser();
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12 text-muted">
        Please connect your wallet to view your profile
      </div>
    );
  }

  return (
    <div>
      {/* Header with Avatar */}
      <div className="flex items-center gap-4 mb-8">
        {/* Avatar with upload functionality */}
        <div className="relative group">
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={isUploading}
            className="relative rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-black"
          >
            {formData.avatarUrl || user.avatarUrl ? (
              <img
                src={formData.avatarUrl || user.avatarUrl || ""}
                alt=""
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-xl text-white font-medium">
                {(formData.name || user.name || user.walletAddress)[0].toUpperCase()}
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="text-white text-xs font-medium">
                {isUploading ? "..." : "Edit"}
              </span>
            </div>
          </button>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white">
            {user.name || "Anonymous"}
          </h2>
          <p className="text-sm text-muted font-mono">
            {user.walletAddress.slice(0, 8)}...{user.walletAddress.slice(-6)}
          </p>
          <p className="text-xs text-muted mt-1">
            Click avatar to change (max 2MB)
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="p-4 bg-primary/10 border border-primary/20 text-primary text-sm rounded-lg">
            Profile updated successfully!
          </div>
        )}

        <Input
          label="Display Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Your name"
        />

        <Input
          label="X (Twitter) Handle"
          name="xHandle"
          value={formData.xHandle}
          onChange={handleChange}
          placeholder="@username"
        />

        <Textarea
          label="Bio"
          name="bio"
          value={formData.bio}
          onChange={handleChange}
          placeholder="Tell us about yourself..."
          rows={4}
        />

        <div className="flex justify-end pt-4">
          <Button type="submit" isLoading={isLoading || isUploading}>
            {isUploading ? "Uploading..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
