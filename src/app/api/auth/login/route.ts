import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySignature, createSignMessage, createToken, setAuthCookie } from "@/lib/auth";
import { getNonce, deleteNonce } from "@/lib/nonce-store";

export async function POST(request: Request) {
  try {
    const { walletAddress, signature, nonce } = await request.json();

    if (!walletAddress || !signature || !nonce) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Verify nonce is valid
    const storedNonce = await getNonce(walletAddress);
    if (!storedNonce || storedNonce !== nonce) {
      return NextResponse.json(
        { error: "Invalid or expired nonce" },
        { status: 401 }
      );
    }

    // Verify the message signature
    const message = createSignMessage(nonce);
    const isValid = verifySignature(message, signature, walletAddress);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { walletAddress },
      });
    }

    // Create JWT token
    const token = await createToken({
      userId: user.id,
      walletAddress: user.walletAddress,
    });

    // Set auth cookie
    await setAuthCookie(token);

    // Remove used nonce
    await deleteNonce(walletAddress);

    return NextResponse.json({
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        name: user.name,
        bio: user.bio,
        xHandle: user.xHandle,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
