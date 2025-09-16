import Redis from "ioredis";

let redisClient: Redis | null = null;

/**
 * Get or create a Redis client instance
 */
export async function getRedisClient(): Promise<Redis> {
  if (redisClient?.status === "ready") {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  try {
    redisClient = new Redis(redisUrl, {
      enableReadyCheck: false,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000, // 10 second connection timeout
      commandTimeout: 5000, // 5 second command timeout
      retryStrategy: (times: number) => {
        // Stop retrying after 10 attempts
        if (times > 10) {
          return null;
        }
        // Exponential backoff with max delay of 5 seconds
        const delay = Math.min(2 ** times * 100, 5000);
        console.log(`Redis reconnect attempt ${times + 1}, waiting ${delay}ms`);
        return delay;
      },
    });

    redisClient.on("error", (error) => {
      console.error("Redis client error:", error);
    });

    redisClient.on("connect", () => {
      console.log("Redis client connected");
    });

    redisClient.on("close", () => {
      console.warn("Redis client disconnected");
    });

    redisClient.on("ready", () => {
      console.log("Redis client ready");
    });

    // Connect to Redis since we're using lazyConnect
    await redisClient.connect();

    return redisClient;
  } catch (error) {
    console.error("Failed to connect to Redis:", error);
    redisClient = null;
    throw new Error(
      `Failed to connect to Redis: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Close the Redis connection gracefully
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient?.status === "ready") {
    try {
      await redisClient.quit();
      redisClient = null;
      console.log("Redis client connection closed");
    } catch (error) {
      console.error("Error closing Redis client:", error);
    }
  }
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    await client.ping();
    return true;
  } catch (error) {
    console.warn("Redis availability check failed:", error);
    return false;
  }
}
