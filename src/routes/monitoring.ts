import { Hono } from "hono";
import { getCacheStats } from "../lib/cache";
import { apiErrorHandler } from "../lib/error-handler";
import { getClientIP, getRateLimitStatus } from "../lib/ratelimit";

const monitoring = new Hono();

// Cache stats endpoint
monitoring.get("/cache-stats", async (c) => {
  return await apiErrorHandler(async () => {
    const ip = getClientIP(c.req.raw);
    const [cacheStats, rateLimitStatus] = await Promise.all([
      getCacheStats(),
      getRateLimitStatus(ip, "api"),
    ]);

    return c.json({
      success: true,
      timestamp: new Date().toISOString(),
      clientIP: ip,
      cache: cacheStats,
      rateLimit: rateLimitStatus,
      info: {
        description: "Cache and rate limit statistics",
        endpoints: {
          "cache-stats":
            "/api/monitoring/cache-stats - Cache and rate limit statistics",
          health: "/api/monitoring/health - Health check",
          journeys: "/api/journeys - Cached journey search",
        },
      },
    });
  }, "/api/monitoring/cache-stats");
});

// Health check endpoint with detailed info
monitoring.get("/health", async (c) => {
  return await apiErrorHandler(async () => {
    const cacheStats = await getCacheStats();

    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      services: {
        redis: {
          connected: cacheStats.connected,
          keys: cacheStats.keys,
          memory: cacheStats.memory,
        },
        api: {
          status: "operational",
        },
      },
      info: {
        description: "BetterBahn Split API - Health Check",
        features: [
          "Redis Caching",
          "Rate Limiting",
          "Journey Search",
          "Split Analysis",
        ],
      },
    });
  }, "/api/monitoring/health");
});

// Rate limit test endpoint
monitoring.get("/test-rate-limit", async (c) => {
  return await apiErrorHandler(async () => {
    const ip = getClientIP(c.req.raw);
    const rateLimitStatus = await getRateLimitStatus(ip, "api");

    return c.json({
      success: true,
      message:
        "Rate limit test endpoint - each request counts towards your limit",
      clientIP: ip,
      rateLimit: rateLimitStatus
        ? {
            allowed: rateLimitStatus.allowed,
            count: rateLimitStatus.count,
            limit: rateLimitStatus.limit,
            remaining: rateLimitStatus.remaining,
            resetTime: rateLimitStatus.resetTime,
          }
        : {
            message: "Rate limiting not available (Redis unavailable)",
          },
      info: {
        description: "This endpoint shows your current rate limit status",
        limits: {
          api: "30 requests per minute",
          instructions: "Make rapid requests to see rate limiting in action",
        },
      },
    });
  }, "/api/monitoring/test-rate-limit");
});

export { monitoring };
