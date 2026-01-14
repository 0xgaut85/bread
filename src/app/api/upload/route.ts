import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * General image upload API
 * 
 * Used for:
 * - Submission images (task entries)
 * - Profile avatar updates (when updateAvatar=true)
 * 
 * Query params:
 * - updateAvatar=true: Also update the user's avatar (for profile editor)
 */
export async function POST(request: Request) {
  try {
    const payload = await getCurrentUser();

    if (!payload) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check if this is an avatar update request
    const { searchParams } = new URL(request.url);
    const updateAvatar = searchParams.get("updateAvatar") === "true";

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: JPEG, PNG, GIF, WebP" },
        { status: 400 }
      );
    }

    // Validate file size (limit to 2MB for base64 storage)
    const maxSize = Math.min(MAX_FILE_SIZE, 2 * 1024 * 1024); // 2MB max
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File too large. Maximum size: 2MB" },
        { status: 400 }
      );
    }

    // Convert to base64 data URL
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Only update avatar if explicitly requested (for profile editor)
    if (updateAvatar) {
      await prisma.user.update({
        where: { id: payload.userId },
        data: { avatarUrl: dataUrl },
      });
    }

    return NextResponse.json({ url: dataUrl });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
