"use client";

import dynamic from "next/dynamic";
import { AuthProvider } from "./AuthProvider";

// Dynamically import WalletProvider with SSR disabled
// This prevents the Solana wallet adapter from running during static generation
const WalletProvider = dynamic(
  () => import("@/components/wallet/WalletProvider").then((mod) => mod.WalletProvider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <AuthProvider>{children}</AuthProvider>
    </WalletProvider>
  );
}
