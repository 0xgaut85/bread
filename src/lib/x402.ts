/**
 * x402 Payment Protocol Handler
 * Using x402-solana v0.1.5 (stable v1 protocol)
 *
 * Reference: https://github.com/PayAINetwork/x402-solana
 */

import { X402PaymentHandler } from "x402-solana/server";

// USDC Mint addresses
export const USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Network configuration
const IS_PRODUCTION = process.env.NODE_ENV === "production";
export const NETWORK: "solana" | "solana-devnet" = IS_PRODUCTION
  ? "solana"
  : "solana-devnet";
export const USDC_MINT = IS_PRODUCTION ? USDC_MINT_MAINNET : USDC_MINT_DEVNET;

// Server URLs
export const FACILITATOR_URL = "https://facilitator.payai.network";
export const X402_PUBLIC_URL =
  process.env.X402_PUBLIC_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://bread.markets";

// x402 Payment amounts (in micro-units, 1 USDC = 1,000,000)
export const X402_DISCOVERY_FEE = "10000"; // 0.01 USDC to discover tasks
export const X402_SUBMISSION_FEE = "10000"; // 0.01 USDC to submit work

// Treasury/Escrow address (where payments go)
export const TREASURY_ADDRESS =
  process.env.TREASURY_WALLET_ADDRESS ||
  process.env.ESCROW_WALLET_ADDRESS ||
  "";

// Helius RPC for reliable Solana access
export const SOLANA_RPC_URL =
  process.env.HELIUS_RPC_URL ||
  process.env.SOLANA_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

// Lazy initialization of x402 handler (avoids issues during build)
let _x402Handler: X402PaymentHandler | null = null;

/**
 * Get the x402 payment handler instance
 * Lazily initialized to avoid build-time issues
 */
export function getX402Handler(): X402PaymentHandler {
  if (!_x402Handler) {
    if (!TREASURY_ADDRESS) {
      throw new Error(
        "TREASURY_WALLET_ADDRESS or ESCROW_WALLET_ADDRESS must be set"
      );
    }

    _x402Handler = new X402PaymentHandler({
      network: NETWORK,
      treasuryAddress: TREASURY_ADDRESS,
      facilitatorUrl: FACILITATOR_URL,
      rpcUrl: SOLANA_RPC_URL,
    });

    console.log("[x402] Handler initialized");
    console.log("[x402] Network:", NETWORK);
    console.log("[x402] Treasury:", TREASURY_ADDRESS);
  }

  return _x402Handler;
}

/**
 * Output schema type for x402scan validation
 */
interface OutputSchema {
  input: {
    type: "http";
    method: "GET" | "POST";
    bodyType?: "json" | "form-data" | "multipart-form-data" | "text" | "binary";
    queryParams?: Record<string, { type?: string; required?: boolean; description?: string }>;
    bodyFields?: Record<string, { type?: string; required?: boolean | string[]; description?: string; enum?: string[] }>;
    headerFields?: Record<string, { type?: string; required?: boolean; description?: string }>;
  };
  output?: Record<string, { type?: string; description?: string }>;
}

/**
 * Create route config for payment requirements
 * Includes outputSchema for x402scan validation
 */
export function createRouteConfig(
  amount: string,
  description: string,
  outputSchema?: OutputSchema
): {
  price: { amount: string; asset: { address: string; decimals: number } };
  network: "solana" | "solana-devnet";
  config: { description: string; discoverable: boolean; outputSchema?: OutputSchema };
} {
  return {
    price: {
      amount,
      asset: {
        address: USDC_MINT,
        decimals: 6,
      },
    },
    network: NETWORK,
    config: {
      description,
      discoverable: true,
      ...(outputSchema && { outputSchema }),
    },
  };
}

/**
 * Convert USDC amount to micro-units string
 * 1 USDC = 1,000,000 micro-units
 */
export function usdcToMicroUnits(amount: number): string {
  return Math.round(amount * 1_000_000).toString();
}

/**
 * Convert micro-units string to USDC amount
 */
export function microUnitsToUsdc(microUnits: string): number {
  return parseInt(microUnits, 10) / 1_000_000;
}

/**
 * x402 Discovery schema for AI agents
 */
export interface X402Discovery {
  version: string;
  name: string;
  description: string;
  endpoints: {
    path: string;
    method: string;
    price: {
      maxAmountRequired: string;
      currency: string;
      decimals: number;
      usd: number;
    };
    network: string;
    description?: string;
  }[];
  treasury: string;
  facilitator: string;
}

/**
 * Create x402 discovery response for AI agents
 */
export function createDiscoveryResponse(
  tasks: { path: string; reward: number; description: string }[]
): X402Discovery {
  return {
    version: "1.0",
    name: "Bread - Decentralized Task Coordination",
    description:
      "Get bread by completing tasks and earning USDC rewards. AI agents can discover tasks, submit work, and receive payments via x402 protocol.",
    endpoints: tasks.map((task) => ({
      path: task.path,
      method: "POST",
      price: {
        maxAmountRequired: usdcToMicroUnits(task.reward),
        currency: "USDC",
        decimals: 6,
        usd: task.reward,
      },
      network: NETWORK,
      description: task.description,
    })),
    treasury: TREASURY_ADDRESS,
    facilitator: FACILITATOR_URL,
  };
}
