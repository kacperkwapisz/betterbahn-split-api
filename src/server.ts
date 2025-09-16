import app from "./index";

const port = process.env.PORT || 3000;

console.log(`🚀 Server running at http://0.0.0.0:${port}`);

export default {
  port,
  fetch: app.fetch,
  development: false, // production mode
  reusePort: true, // better performance for production
  maxRequestBodySize: 1024 * 1024 * 100, // 100mb
  // idleTimeout: 255, // 255 seconds
};
