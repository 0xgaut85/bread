"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";

interface User {
  id: string;
  walletAddress: string;
  name: string | null;
  bio: string | null;
  xHandle: string | null;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track if we've already attempted auto-login for this wallet connection
  // This prevents infinite sign message loops when user rejects or login fails
  const loginAttemptedRef = useRef<string | null>(null);

  // Check if already authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Auto-login when wallet connects (and we don't have a user yet, or user doesn't match)
  useEffect(() => {
    const walletAddress = publicKey?.toBase58();
    
    // If wallet is connected but user doesn't match, clear user and re-login
    if (connected && walletAddress && user && user.walletAddress !== walletAddress) {
      console.log("Wallet changed, clearing old session");
      fetch("/api/auth/logout", { method: "POST" }).catch(console.error);
      setUser(null);
      loginAttemptedRef.current = null; // Reset so we can login with new wallet
    }
    
    // Only attempt auto-login if:
    // 1. Wallet is connected with a public key
    // 2. We don't have a user yet
    // 3. We're not currently loading
    // 4. We haven't already attempted login for this specific wallet
    if (connected && walletAddress && !user && !isLoading && loginAttemptedRef.current !== walletAddress) {
      loginAttemptedRef.current = walletAddress;
      login().catch(console.error);
    }
  }, [connected, publicKey, user, isLoading]);

  // Clear user and reset login attempt when wallet disconnects
  useEffect(() => {
    if (!connected) {
      if (user) {
        setUser(null);
      }
      // Reset login attempt tracking when wallet disconnects
      loginAttemptedRef.current = null;
    }
  }, [connected, user]);

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const data = await response.json();
        // Only set user if wallet matches or no wallet connected yet
        const connectedWallet = publicKey?.toBase58();
        if (!connectedWallet || data.user.walletAddress === connectedWallet) {
          setUser(data.user);
        } else {
          // Wallet mismatch - clear the stale session
          console.log("Wallet mismatch, clearing session");
          await fetch("/api/auth/logout", { method: "POST" });
          setUser(null);
        }
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async () => {
    if (!publicKey || !signMessage) {
      console.error("Wallet not connected or signMessage not available");
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Get nonce
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toBase58() }),
      });

      if (!nonceResponse.ok) {
        throw new Error("Failed to get nonce");
      }

      const { nonce, message } = await nonceResponse.json();

      // Step 2: Sign message
      const messageBytes = new TextEncoder().encode(message);
      const signature = await signMessage(messageBytes);
      const signatureBase58 = bs58.encode(signature);

      // Step 3: Verify and login
      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: publicKey.toBase58(),
          signature: signatureBase58,
          nonce,
        }),
      });

      if (!loginResponse.ok) {
        throw new Error("Login failed");
      }

      const { user: loggedInUser } = await loginResponse.json();
      setUser(loggedInUser);
      // Login succeeded - keep the ref set so we don't re-attempt
    } catch (error) {
      console.error("Login error:", error);
      // Login failed - reset the ref so user can manually trigger login again if needed
      // But don't reset immediately to prevent infinite loop - only reset on disconnect
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage]);

  const logout = useCallback(() => {
    // Clear server session
    fetch("/api/auth/logout", { method: "POST" }).catch(console.error);
    // Clear local state
    setUser(null);
    // Disconnect wallet
    disconnect().catch(console.error);
  }, [disconnect]);

  const refreshUser = useCallback(async () => {
    await checkAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
