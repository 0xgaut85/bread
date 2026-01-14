import { PrismaClient } from "@prisma/client";
import { assertEnvValid } from "./env-validation";

// Validate environment variables on first import
// Skip during build time (when DATABASE_URL is not available)
// This runs once when the module is loaded at runtime
let envValidated = false;
const isBuildTime = !process.env.DATABASE_URL && process.env.NODE_ENV === "production";
if (!envValidated && !isBuildTime) {
  assertEnvValid();
  envValidated = true;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
