import { getRedisClient, isRedisAvailable } from "./redis";

/**
 * Configuration for cache operations
 */
export interface CacheConfig {
  /** Cache TTL in seconds */
  ttl: number;
  /** Whether to use compression for large values */
  compress?: boolean;
  /** Custom key prefix */
  keyPrefix?: string;
  /** Maximum value size in bytes (default: 1MB) */
  maxValueSize?: number;
}

/**
 * Result of a cache operation
 */
export interface CacheResult<T> {
  /** Whether the value was found in cache */
  hit: boolean;
  /** The cached or computed value */
  value: T;
  /** Cache key used */
  key: string;
  /** Time taken for the operation in milliseconds */
  duration: number;
}

/**
 * Custom hash function combining djb2 and fnv1a algorithms
 */
function customHash(str: string): string {
  // Handle edge cases
  if (!str || typeof str !== "string") {
    str = String(str || "");
  }

  // djb2 hash
  let djb2 = 5381;
  for (let i = 0; i < str.length; i++) {
    djb2 = (djb2 << 5) + djb2 + str.charCodeAt(i);
    djb2 = djb2 & djb2; // Convert to 32-bit integer
  }

  // fnv1a hash for additional entropy
  let fnv = 2166136261;
  for (let i = 0; i < str.length; i++) {
    fnv ^= str.charCodeAt(i);
    fnv *= 16777619;
    fnv = fnv & fnv; // Convert to 32-bit integer
  }

  // Combine both hashes and convert to base36
  const combined = Math.abs(djb2) ^ Math.abs(fnv);
  return combined.toString(36).padStart(8, "0");
}

/**
 * Generate a cache key from parameters using custom hash
 */
function generateCacheKey(
  endpoint: string,
  params: Record<string, unknown>,
): string {
  try {
    // Sort keys for consistent hashing and filter out undefined values
    const sortedKeys = Object.keys(params).sort();
    const cleanParams = sortedKeys.reduce(
      (acc, key) => {
        const value = params[key];
        // Skip undefined, functions, and symbols
        if (
          value !== undefined &&
          typeof value !== "function" &&
          typeof value !== "symbol"
        ) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>,
    );

    const paramString = JSON.stringify(cleanParams);
    const hash = customHash(paramString || "{}");
    return `betterbahn:${endpoint}:${hash}`;
  } catch (error) {
    // Fallback to endpoint + timestamp if JSON.stringify fails
    console.error("Failed to generate cache key:", error);
    const fallbackHash = customHash(`${endpoint}-${Date.now()}`);
    return `betterbahn:${endpoint}:${fallbackHash}`;
  }
}

/**
 * Generic cache wrapper function
 */
export async function withCache<T>(
  key: string,
  config: CacheConfig,
  fetchFn: () => Promise<T>,
  params: Record<string, unknown> = {},
): Promise<CacheResult<T>> {
  const startTime = Date.now();
  const cacheKey =
    Object.keys(params).length > 0
      ? generateCacheKey(key, params)
      : `betterbahn:${config.keyPrefix || "default"}:${key}`;

  try {
    // Check if Redis is available
    if (!(await isRedisAvailable())) {
      console.warn("Redis unavailable, executing fetch function directly");
      const value = await fetchFn();
      const duration = Date.now() - startTime;

      return {
        hit: false,
        value,
        key: cacheKey,
        duration,
      };
    }

    const client = await getRedisClient();

    // Try to get value from cache
    const cachedValue = await client.get(cacheKey);

    if (cachedValue !== null) {
      // Cache hit
      const duration = Date.now() - startTime;
      console.log(`Cache hit for key: ${cacheKey} (${duration}ms)`);

      try {
        const parsedValue = JSON.parse(cachedValue) as T;
        return {
          hit: true,
          value: parsedValue,
          key: cacheKey,
          duration,
        };
      } catch (parseError) {
        // If parsing fails, treat as cache miss
        console.error(
          `Failed to parse cached value for key ${cacheKey}:`,
          parseError,
        );
      }
    }

    // Cache miss - execute fetch function
    const value = await fetchFn();

    // Store in cache
    try {
      const serializedValue = JSON.stringify(value);
      const maxSize = config.maxValueSize || 1024 * 1024; // 1MB default

      // Check value size before caching
      if (serializedValue.length > maxSize) {
        console.warn(
          `Value too large to cache: ${serializedValue.length} bytes > ${maxSize} bytes`,
        );
      } else {
        await client.setex(cacheKey, config.ttl, serializedValue);
        console.log(
          `Value cached successfully: ${cacheKey} (TTL: ${config.ttl}s, Size: ${serializedValue.length} bytes)`,
        );
      }
    } catch (cacheError) {
      // Log error but don't fail the request
      console.error(`Failed to cache value for key ${cacheKey}:`, cacheError);
    }

    const duration = Date.now() - startTime;

    return {
      hit: false,
      value,
      key: cacheKey,
      duration,
    };
  } catch (error) {
    // If anything goes wrong with cache, just execute the fetch function
    console.error(`Cache operation failed for key ${cacheKey}:`, error);

    const value = await fetchFn();
    const duration = Date.now() - startTime;

    return {
      hit: false,
      value,
      key: cacheKey,
      duration,
    };
  }
}

/**
 * Invalidate cache entries by pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  try {
    if (!(await isRedisAvailable())) {
      return 0;
    }

    const client = await getRedisClient();
    // Use SCAN instead of KEYS for production safety
    const keys: string[] = [];
    let cursor = "0";
    do {
      const result = await client.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== "0");

    if (keys.length === 0) {
      return 0;
    }

    const deletedCount = await client.del(keys);
    console.log(`Cache invalidated: ${deletedCount} keys deleted`);

    return deletedCount;
  } catch (error) {
    console.error(`Cache invalidation failed for pattern ${pattern}:`, error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  connected: boolean;
  keys: number;
  memory?: string;
  hashFunction?: string;
}> {
  try {
    if (!(await isRedisAvailable())) {
      return {
        connected: false,
        keys: 0,
        hashFunction: "custom-djb2-fnv1a",
      };
    }

    const client = await getRedisClient();
    // Use SCAN instead of KEYS for production safety
    const keys: string[] = [];
    let cursor = "0";
    do {
      const result = await client.scan(
        cursor,
        "MATCH",
        "betterbahn:*",
        "COUNT",
        100,
      );
      cursor = result[0];
      keys.push(...result[1]);
    } while (cursor !== "0");

    const info = await client.info("memory");

    // Parse memory usage from info string
    const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
    const memory = memoryMatch ? memoryMatch[1] : undefined;

    return {
      connected: true,
      keys: keys.length,
      memory,
      hashFunction: "custom-djb2-fnv1a",
    };
  } catch (error) {
    console.error("Failed to get cache stats:", error);
    return {
      connected: false,
      keys: 0,
      hashFunction: "custom-djb2-fnv1a",
    };
  }
}
