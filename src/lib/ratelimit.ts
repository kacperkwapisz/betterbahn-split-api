import type { Context } from "hono";
import { getRedisClient, isRedisAvailable } from "./redis";

interface RateLimitRequest {
  req?: {
    raw?: Request;
  };
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed */
  limit: number;
  /** Time window in seconds */
  window: number;
  /** Custom key prefix */
  keyPrefix?: string;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count */
  count: number;
  /** Maximum allowed requests */
  limit: number;
  /** Time until reset in seconds */
  resetTime: number;
  /** Remaining requests */
  remaining: number;
}

/**
 * Default rate limit configurations
 */
export const DEFAULT_RATE_LIMITS = {
  API: { limit: 30, window: 60 }, // 30 requests per minute for API routes
  STRICT: { limit: 10, window: 60 }, // 10 requests per minute for strict endpoints
  LENIENT: { limit: 100, window: 60 }, // 100 requests per minute for lenient endpoints
  GLOBAL: { limit: 200, window: 60 }, // 200 requests per minute per IP globally
} as const;

/**
 * Extract IP address from request headers
 */
export function getClientIP(request: Request): string {
  // Prefer Cloudflare headers when present
  const cfIp =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("true-client-ip");
  let ip = cfIp?.trim();

  if (!ip) {
    // x-forwarded-for: client, proxy1, proxy2...
    const forwarded = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    if (forwarded) {
      ip = forwarded;
    }
  }

  if (!ip) {
    const realIP = request.headers.get("x-real-ip")?.trim();
    if (realIP) {
      ip = realIP;
    }
  }

  // Normalize IPv6-mapped IPv4 ::ffff:127.0.0.1 -> 127.0.0.1
  if (ip?.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  return ip || "unknown";
}

/**
 * Rate limit a request based on IP address
 */
export async function rateLimit(
  ip: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const key = `ratelimit:${config.keyPrefix || "default"}:${ip}`;

  try {
    // If Redis is not available, allow the request (fail open)
    if (!(await isRedisAvailable())) {
      console.warn("Redis unavailable, allowing request (fail open)");
      return {
        allowed: true,
        count: 0,
        limit: config.limit,
        resetTime: config.window,
        remaining: config.limit,
      };
    }

    const client = await getRedisClient();

    // Use a pipeline for atomic operations
    const pipeline = client.multi();
    pipeline.incr(key);
    pipeline.expire(key, config.window);
    pipeline.ttl(key);

    const results = await pipeline.exec();

    if (!results || results.length !== 3) {
      throw new Error("Pipeline execution failed");
    }

    // ioredis returns [error, result] tuples
    const count = results[0]?.[1] as number;
    const ttl = results[2]?.[1] as number;

    const allowed = count <= config.limit;
    const remaining = Math.max(0, config.limit - count);
    const resetTime = ttl > 0 ? ttl : config.window;

    if (!allowed) {
      console.warn(
        `Rate limit exceeded for IP ${ip}: ${count}/${config.limit}`,
      );
    }

    return {
      allowed,
      count,
      limit: config.limit,
      resetTime,
      remaining,
    };
  } catch (error) {
    // If anything goes wrong, allow the request (fail open)
    console.error(`Rate limit check failed for IP ${ip}:`, error);

    return {
      allowed: true,
      count: 0,
      limit: config.limit,
      resetTime: config.window,
      remaining: config.limit,
    };
  }
}

/**
 * Wrapper for API routes that includes rate limiting (Hono version of withRateLimit)
 */
export function withRateLimit<T extends unknown[]>(
  handler: (request: RateLimitRequest, ...args: T) => Promise<Response>,
  config: {
    limit?: number;
    window?: number;
    keyPrefix?: string;
  } = {},
) {
  return async (request: RateLimitRequest, ...args: T): Promise<Response> => {
    const rateLimitConfig = {
      limit: config.limit || DEFAULT_RATE_LIMITS.API.limit,
      window: config.window || DEFAULT_RATE_LIMITS.API.window,
      keyPrefix: config.keyPrefix || "api",
    };

    try {
      const rawRequest = request.req?.raw || (request as Request);
      const ip = getClientIP(rawRequest);
      const result = await rateLimit(ip, rateLimitConfig);

      if (!result.allowed) {
        console.warn(`Rate limit exceeded for ${ip}`, {
          ip,
          limit: result.limit,
          remaining: result.remaining,
          resetTime: result.resetTime,
        });

        return Response.json(
          {
            error: "Rate limit exceeded",
            limit: result.limit,
            remaining: result.remaining,
            resetTime: result.resetTime,
          },
          {
            status: 429,
            headers: {
              "X-RateLimit-Limit": result.limit.toString(),
              "X-RateLimit-Remaining": result.remaining.toString(),
              "X-RateLimit-Reset": result.resetTime.toString(),
              "Retry-After": result.resetTime.toString(),
            },
          },
        );
      }

      // Execute the handler
      const response = await handler(request, ...args);

      // Add rate limit headers if response is successful
      if (response.status < 400) {
        response.headers.set("X-RateLimit-Limit", result.limit.toString());
        response.headers.set(
          "X-RateLimit-Remaining",
          result.remaining.toString(),
        );
        response.headers.set("X-RateLimit-Reset", result.resetTime.toString());
      }

      return response;
    } catch (error) {
      // If rate limiting fails, log but continue with request
      console.error(
        `Rate limiting failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return await handler(request, ...args);
    }
  };
}

/**
 * Create a rate limit middleware for Hono (legacy)
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  return async (c: Context, next: () => Promise<void>) => {
    const ip = getClientIP(c.req.raw);
    const result = await rateLimit(ip, config);

    // Add rate limit headers
    c.header("X-RateLimit-Limit", result.limit.toString());
    c.header("X-RateLimit-Remaining", result.remaining.toString());
    c.header("X-RateLimit-Reset", result.resetTime.toString());

    if (!result.allowed) {
      return c.json(
        {
          error: "Rate limit exceeded",
          limit: result.limit,
          remaining: result.remaining,
          resetTime: result.resetTime,
        },
        429,
      );
    }

    await next();
  };
}

/**
 * Get rate limit stats for an IP
 */
export async function getRateLimitStatus(
  ip: string,
  keyPrefix: string = "default",
): Promise<RateLimitResult | null> {
  try {
    if (!(await isRedisAvailable())) {
      return null;
    }

    const client = await getRedisClient();
    const key = `ratelimit:${keyPrefix}:${ip}`;

    const [count, ttl] = await Promise.all([client.get(key), client.ttl(key)]);

    if (count === null) {
      return null;
    }

    const currentCount = parseInt(count, 10);
    const config = DEFAULT_RATE_LIMITS.API; // Use default for status check

    return {
      allowed: currentCount <= config.limit,
      count: currentCount,
      limit: config.limit,
      resetTime: ttl > 0 ? ttl : 0,
      remaining: Math.max(0, config.limit - currentCount),
    };
  } catch (error) {
    console.error(`Failed to get rate limit status for IP ${ip}:`, error);
    return null;
  }
}
