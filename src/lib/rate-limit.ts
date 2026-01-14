/**
 * Rate Limiting for API Endpoints
 * 
 * Simple in-memory rate limiter using sliding window algorithm.
 * For multi-instance deployments, replace with Redis-based implementation.
 * 
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 10 });
 *   const result = limiter.check(clientId);
 *   if (!result.allowed) return 429 response;
 */

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

/**
 * Create a rate limiter instance
 */
export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitEntry>();
  
  // Cleanup old entries periodically
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) {
        store.delete(key);
      }
    }
  }, config.windowMs);

  return {
    /**
     * Check if a request is allowed
     */
    check(clientId: string): RateLimitResult {
      const now = Date.now();
      const entry = store.get(clientId);

      // No existing entry or window expired - allow and create new entry
      if (!entry || entry.resetAt < now) {
        store.set(clientId, {
          count: 1,
          resetAt: now + config.windowMs,
        });
        return {
          allowed: true,
          remaining: config.maxRequests - 1,
          resetAt: now + config.windowMs,
        };
      }

      // Within window - check count
      if (entry.count < config.maxRequests) {
        entry.count++;
        return {
          allowed: true,
          remaining: config.maxRequests - entry.count,
          resetAt: entry.resetAt,
        };
      }

      // Rate limited
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      };
    },

    /**
     * Reset rate limit for a client
     */
    reset(clientId: string): void {
      store.delete(clientId);
    },

    /**
     * Get current stats
     */
    getStats(): { totalClients: number; config: RateLimitConfig } {
      return {
        totalClients: store.size,
        config,
      };
    },
  };
}

// Pre-configured rate limiters for different endpoints
// x402 endpoints: 60 requests per minute (generous for AI agents)
export const x402RateLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 60,      // 60 requests per minute
});

// Auth endpoints: 20 requests per minute (prevent brute force)
export const authRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 20,      // 20 requests per minute
});

// General API: 100 requests per minute
export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,  // 1 minute
  maxRequests: 100,     // 100 requests per minute
});

/**
 * Extract client identifier from request
 * Uses X-Forwarded-For header (for proxies) or falls back to a default
 */
export function getClientId(request: Request): string {
  // Try X-Forwarded-For (common for proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // Take the first IP in the chain
    return forwarded.split(",")[0].trim();
  }

  // Try X-Real-IP (nginx)
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Try CF-Connecting-IP (Cloudflare)
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  // Fallback - use a hash of user agent + accept headers
  const ua = request.headers.get("user-agent") || "unknown";
  const accept = request.headers.get("accept") || "unknown";
  return `anon-${hashCode(ua + accept)}`;
}

/**
 * Simple hash function for fallback client ID
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Create rate limit headers for response
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(result.resetAt / 1000).toString(),
  };

  if (!result.allowed && result.retryAfter) {
    headers["Retry-After"] = result.retryAfter.toString();
  }

  return headers;
}
