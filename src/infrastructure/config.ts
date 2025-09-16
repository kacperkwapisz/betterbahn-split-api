export const Config = {
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || "0.0.0.0",
    corsOrigins: process.env.CORS_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
    rateLimits: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    },
  },
  storage: {
    discordWebhooks: process.env.DISCORD_WEBHOOKS!.split(","),
    discordUserToken: process.env.DISCORD_USER_TOKEN!,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    chunkSize: 9 * 1024 * 1024, // 9MB
  },
  monitoring: {
    sentryDsn: process.env.SENTRY_DSN!,
    loggingLevel: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
} as const;
