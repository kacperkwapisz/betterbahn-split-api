import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";

import { journeys } from "./routes/journeys";
import { monitoring } from "./routes/monitoring";
import { parseUrl } from "./routes/parse-url";
import { splitJourney } from "./routes/split-journey";

const app = new Hono();

// Middleware
app.use(logger());
app.use(prettyJSON());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Root endpoint
app.get("/", (c) => {
  return c.json({
    message: "BetterBahn Split API",
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API Routes
app.route("/api/journeys", journeys);
app.route("/api/split-journey", splitJourney);
app.route("/api/parse-url", parseUrl);
app.route("/api/monitoring", monitoring);

app.onError((err, c) => {
  console.error(err);
  return c.json(
    {
      error: "Internal server error",
      code: "INTERNAL_ERROR",
      timestamp: new Date().toISOString(),
    },
    500,
  );
});

export default app;
