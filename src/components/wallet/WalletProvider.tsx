"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";

// Import default styles
import "@solana/wallet-adapter-react-ui/styles.css";

interface WalletProviderProps {
  children: React.ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  // Use our backend RPC proxy to keep API keys server-side
  // Safety check for SSR (though this component is loaded with ssr: false)
  const endpoint = useMemo(() => {
    if (typeof window === "undefined") {
      // Fallback for SSR - will be replaced on client
      return "https://api.mainnet-beta.solana.com";
    }
    return `${window.location.origin}/api/rpc`;
  }, []);

  // Empty wallets array - the adapter will auto-detect installed wallets via Wallet Standard
  // This is the recommended approach as of wallet-adapter v0.15+
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
