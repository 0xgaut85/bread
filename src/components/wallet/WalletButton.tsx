"use client";

import dynamic from "next/dynamic";

// Dynamically import WalletMultiButton to avoid SSR issues
const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export function WalletButton() {
  return (
    <WalletMultiButton 
      style={{
        background: "linear-gradient(165deg, rgba(15, 15, 15, 1) 0%, rgba(30, 30, 30, 1) 40%, rgba(45, 45, 45, 1) 70%, rgba(25, 25, 25, 1) 100%)",
        borderRadius: "12px",
        height: "40px",
        padding: "0 20px",
        fontSize: "14px",
        fontWeight: "400",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    />
  );
}
