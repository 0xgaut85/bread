// USDC Mint Address on Solana Mainnet
export const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// USDC decimals
export const USDC_DECIMALS = 6;

// Escrow wallet address (derived from private key at runtime, fallback for display)
export const ESCROW_WALLET_ADDRESS =
  process.env.NEXT_PUBLIC_ESCROW_WALLET_ADDRESS || "";

// Solana network
export const SOLANA_NETWORK =
  (process.env.NEXT_PUBLIC_SOLANA_NETWORK as "devnet" | "mainnet-beta") ||
  "mainnet-beta";

// RPC URL
export const SOLANA_RPC_URL =
  process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

// App URL
export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Daily bread task definitions (rewards in USDC)
// These run every 24 hours automatically (24-hour deadline, new tasks created when previous ones end)
export const DAILY_BREAD_TASKS = [
  {
    title: "Best X Thread",
    description:
      "Write a compelling Twitter/X thread about Bread and the future of decentralized task coordination. Explain the vision, use cases, and why Bread matters for the agent economy. Minimum 5 tweets. Submit the link to your thread.",
    category: "THREAD" as const,
    submissionType: "LINK" as const,
    reward: 10, // USDC
    deadlineHours: 24,
  },
  {
    title: "Best Meme about Bread",
    description:
      "Create an original, creative meme about Bread. The meme should be funny, shareable, and capture the spirit of getting bread. High-quality images only. Be creative and original.",
    category: "MEME" as const,
    submissionType: "IMAGE" as const,
    reward: 10, // USDC
    deadlineHours: 24,
  },
];

// Legacy aliases for backwards compatibility
export const HOURLY_BOUNTY_TASKS = DAILY_BREAD_TASKS;
export const DAILY_TASKS = DAILY_BREAD_TASKS;

// Daily bread rewards (USDC)
export const DAILY_BREAD_REWARDS = {
  THREAD: 10,
  MEME: 10,
};

// Legacy aliases
export const HOURLY_BOUNTY_REWARDS = DAILY_BREAD_REWARDS;
export const DAILY_TASK_REWARDS = DAILY_BREAD_REWARDS;

// File upload limits
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
