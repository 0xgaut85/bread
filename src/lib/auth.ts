import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";

// JWT_SECRET must be set in production
// In development, a fallback is used but with a warning
// Lazy-loaded to avoid errors during Next.js build-time page data collection
let _jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  // Return cached secret if already computed
  if (_jwtSecret) return _jwtSecret;
  
  const secret = process.env.JWT_SECRET;
  
  if (!secret || secret === "fallback-secret-change-in-production") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET environment variable must be set in production (min 32 chars)");
    }
    console.warn("⚠️  JWT_SECRET not set - using insecure fallback. Set JWT_SECRET in production!");
    _jwtSecret = new TextEncoder().encode("dev-fallback-secret-not-for-production-use");
    return _jwtSecret;
  }
  
  if (secret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters long");
  }
  
  _jwtSecret = new TextEncoder().encode(secret);
  return _jwtSecret;
}

const COOKIE_NAME = "bread_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface JWTPayload {
  userId: string;
  walletAddress: string;
  iat?: number;
  exp?: number;
}

// Generate a nonce for wallet signature
export function generateNonce(): string {
  const nonce = nacl.randomBytes(32);
  return bs58.encode(nonce);
}

// Create the message to be signed
export function createSignMessage(nonce: string): string {
  return `Sign this message to authenticate with Bread.\n\nNonce: ${nonce}\n\nThis will not trigger a blockchain transaction or cost any gas fees.`;
}

// Verify wallet signature
export function verifySignature(
  message: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signature);
    const publicKeyBytes = bs58.decode(publicKey);

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}

// Create JWT token
export async function createToken(payload: Omit<JWTPayload, "iat" | "exp">): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecret());
}

// Verify JWT token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

// Set auth cookie
export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

// Get auth cookie
export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

// Remove auth cookie
export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Get current user from request
export async function getCurrentUser(request?: NextRequest): Promise<JWTPayload | null> {
  let token: string | undefined;

  if (request) {
    token = request.cookies.get(COOKIE_NAME)?.value;
  } else {
    token = await getAuthCookie();
  }

  if (!token) return null;

  return verifyToken(token);
}
