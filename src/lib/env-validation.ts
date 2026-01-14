/**
 * Environment Variable Validation
 * 
 * Validates required environment variables at startup.
 * Throws an error if critical variables are missing.
 * 
 * This module should be imported early in the application lifecycle.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
  validator?: (value: string) => boolean;
  defaultValue?: string;
}

const ENV_VARS: EnvVar[] = [
  // Critical - Application will fail without these
  {
    name: "DATABASE_URL",
    required: true,
    description: "PostgreSQL connection string",
  },
  {
    name: "JWT_SECRET",
    required: true,
    description: "Secret key for JWT token signing (min 32 chars)",
    validator: (value) => value.length >= 32 && value !== "fallback-secret-change-in-production",
  },
  
  // Escrow - Required for payment functionality
  {
    name: "ESCROW_PRIVATE_KEY",
    required: true,
    description: "Base58-encoded private key for escrow wallet",
    validator: (value) => value.length >= 64, // Base58 private keys are ~88 chars
  },
  {
    name: "NEXT_PUBLIC_ESCROW_WALLET_ADDRESS",
    required: true,
    description: "Public address of the escrow wallet",
    validator: (value) => value.length >= 32 && value.length <= 50,
  },
  
  // x402 - Required for AI agent payments
  {
    name: "TREASURY_WALLET_ADDRESS",
    required: false, // Falls back to ESCROW_WALLET_ADDRESS
    description: "Treasury wallet for x402 payments (defaults to escrow)",
  },
  
  // Solana RPC - Has public fallback but should be set for reliability
  {
    name: "HELIUS_RPC_URL",
    required: false,
    description: "Helius RPC URL for reliable Solana access",
    defaultValue: "https://api.mainnet-beta.solana.com",
  },
  
  // AI Judging - Optional but recommended
  {
    name: "ANTHROPIC_API_KEY",
    required: false,
    description: "Anthropic API key for AI judging (falls back to random selection)",
  },
  
  // Admin/Cron - Required for automated operations
  {
    name: "ADMIN_API_KEY",
    required: false,
    description: "API key for admin endpoints (judging, etc.)",
    validator: (value) => value.length >= 16,
  },
  {
    name: "CRON_SECRET",
    required: false,
    description: "Secret for cron job authentication",
  },
  
  // App Configuration
  {
    name: "NEXT_PUBLIC_APP_URL",
    required: false,
    description: "Public URL of the application",
    defaultValue: "http://localhost:3000",
  },
  {
    name: "X402_PUBLIC_URL",
    required: false,
    description: "Public URL for x402 endpoints",
    defaultValue: "https://bread.markets",
  },
  {
    name: "NEXT_PUBLIC_SOLANA_NETWORK",
    required: false,
    description: "Solana network (devnet or mainnet-beta)",
    defaultValue: "mainnet-beta",
    validator: (value) => ["devnet", "mainnet-beta"].includes(value),
  },
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate all environment variables
 */
export function validateEnv(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];

    // Check if required variable is missing
    if (envVar.required && !value) {
      errors.push(`Missing required env var: ${envVar.name} - ${envVar.description}`);
      continue;
    }

    // Check if optional variable is missing (warning)
    if (!envVar.required && !value && !envVar.defaultValue) {
      warnings.push(`Optional env var not set: ${envVar.name} - ${envVar.description}`);
      continue;
    }

    // Run custom validator if value exists
    if (value && envVar.validator && !envVar.validator(value)) {
      if (envVar.required) {
        errors.push(`Invalid value for ${envVar.name}: ${envVar.description}`);
      } else {
        warnings.push(`Invalid value for ${envVar.name}: ${envVar.description}`);
      }
    }
  }

  // Special validation: Check JWT_SECRET is not the default
  if (process.env.JWT_SECRET === "fallback-secret-change-in-production") {
    errors.push("JWT_SECRET is using insecure default value. Set a secure secret (min 32 chars).");
  }

  // Special validation: Either ADMIN_API_KEY or CRON_SECRET should be set for production
  if (process.env.NODE_ENV === "production" && !process.env.ADMIN_API_KEY && !process.env.CRON_SECRET) {
    warnings.push("Neither ADMIN_API_KEY nor CRON_SECRET is set. Automated judging will not work.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate environment and throw if critical errors
 * Call this at application startup
 */
export function assertEnvValid(): void {
  // Skip validation during Next.js build time
  // NEXT_PHASE is set during build: https://nextjs.org/docs/app/api-reference/next-config-js/env
  const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                      process.env.SKIP_ENV_VALIDATION === "true";
  if (isBuildTime) {
    console.log("⏭️  Skipping env validation during build time");
    return;
  }

  const result = validateEnv();

  // Log warnings
  if (result.warnings.length > 0) {
    console.warn("⚠️  Environment variable warnings:");
    result.warnings.forEach((w) => console.warn(`   - ${w}`));
  }

  // Throw on errors
  if (!result.valid) {
    console.error("❌ Environment variable errors:");
    result.errors.forEach((e) => console.error(`   - ${e}`));
    
    // In development, just warn. In production, throw.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `Environment validation failed:\n${result.errors.join("\n")}`
      );
    } else {
      console.warn("⚠️  Running in development mode with invalid env vars. Some features may not work.");
    }
  } else {
    console.log("✅ Environment variables validated successfully");
  }
}

/**
 * Get a summary of environment configuration
 */
export function getEnvSummary(): Record<string, string> {
  const summary: Record<string, string> = {};

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name];
    if (value) {
      // Mask sensitive values
      if (envVar.name.includes("SECRET") || envVar.name.includes("KEY") || envVar.name.includes("PRIVATE")) {
        summary[envVar.name] = `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`;
      } else {
        summary[envVar.name] = value;
      }
    } else if (envVar.defaultValue) {
      summary[envVar.name] = `(default: ${envVar.defaultValue})`;
    } else {
      summary[envVar.name] = "(not set)";
    }
  }

  return summary;
}
