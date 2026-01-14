# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* prisma ./
RUN npm install --legacy-peer-deps && npx prisma generate

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1

# Build-time arguments for NEXT_PUBLIC_ variables
# These are embedded into the client-side JavaScript bundle
ARG NEXT_PUBLIC_ESCROW_WALLET_ADDRESS
ARG NEXT_PUBLIC_SOLANA_NETWORK
ARG NEXT_PUBLIC_APP_URL

# Set them as environment variables for the build
ENV NEXT_PUBLIC_ESCROW_WALLET_ADDRESS=$NEXT_PUBLIC_ESCROW_WALLET_ADDRESS
ENV NEXT_PUBLIC_SOLANA_NETWORK=$NEXT_PUBLIC_SOLANA_NETWORK
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Skip environment validation during build (env vars are only available at runtime)
ENV SKIP_ENV_VALIDATION=true

RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy only what's needed
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
