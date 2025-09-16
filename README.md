# BetterBahn Split API

Standalone API for BetterBahn, built with Bun + Hono. This service exposes the API endpoints that were previously part of the Next.js app, keeping responses 1:1 compatible so it can be used as a drop‑in replacement.

Original project: BetterBahn (`next` app) — see `https://github.com/l2xu/betterbahn`.

This repository focuses on the API only.

## Highlights

- Bun + Hono, fast and lightweight
- 1:1 endpoint parity with the original Next.js API
- Zod validation and strict typing
- Optional Redis-backed caching and rate limiting (graceful fail-open)
- Monitoring endpoints and improved error handling

## Tech

- Runtime: [Bun](https://bun.sh)
- Framework: [Hono](https://hono.dev)
- DB API client: [db-vendo-client](https://github.com/public-transport/db-vendo-client)
- Validation: [Zod](https://zod.dev)
- Optional: [Redis](https://redis.io) via `ioredis` for caching and rate limiting

## Project Layout

```
src/
  index.ts                 # Hono app bootstrapping
  routes/
    journeys.ts           # GET /api/journeys
    split-journey.ts      # GET /api/split-journey (streaming)
    parse-url.ts          # GET /api/parse-url
    monitoring.ts         # /api/monitoring/* (health, cache stats, rate tests)
  lib/
    cache.ts              # Redis cache wrapper (optional)
    ratelimit.ts          # IP-based rate limiting (optional)
    error-handler.ts      # Error handling utilities
    configure-search-options.ts
    extract-url-params.ts
  utils/
    schemas.ts            # Shared Zod schemas & types
    journeyUtils.ts       # Client-side helpers used by the app
```

## Getting Started

Prerequisites:

- Bun (runtime)
- pnpm (dependency management)

Install deps and start dev server:

```
pnpm install
bun run dev
```

The server runs on `http://localhost:3000`.

## Environment

Optional Redis (recommended for production):

```
export REDIS_URL="redis://localhost:6379"
```

Without Redis, caching and rate limiting gracefully degrade and the API remains fully functional.

### Redis quick start

Redis is optional. If set, it's used for response caching and IP rate limiting.

```
# macOS (Homebrew)
brew install redis && redis-server

# Configure the API to use Redis
export REDIS_URL="redis://localhost:6379"
bun run dev
```

For hosted Redis (e.g. Upstash/Railway):

```
export REDIS_URL="redis://username:password@host:port"
bun run dev
```

## Endpoints

- GET `/api/journeys` — Journey search; same response shape as the original Next.js route
- GET `/api/split-journey` — Split ticket analysis (streaming)
- GET `/api/parse-url` — Extract parameters from a DB booking URL/text
- GET `/api/monitoring/health` — Health and dependency checks
- GET `/api/monitoring/cache-stats` — Cache and rate limit stats (if Redis enabled)

All responses are designed to match the legacy app for seamless migration.

## Docker

Build and run the API with Docker:

```
docker build -t betterbahn-split-api .
docker run -p 3000:3000 --env REDIS_URL=$REDIS_URL betterbahn-split-api
```

Or via docker compose:

```
docker compose up -d
```

This uses the published image from the Compose file. To pass Redis config via Compose, add `REDIS_URL` to the service `environment`.

### Quick cURL samples

```
# Health
curl -s http://localhost:3000/api/monitoring/health | jq .

# Journeys
curl -s "http://localhost:3000/api/journeys?from=8011160&to=8500010&departure=2025-12-01T14:32&hasDeutschlandTicket=true" | jq '.success,.journeys[0]'

# Parse URL
curl -s "http://localhost:3000/api/parse-url?text=$(printf %s "https://bahn.de/..." | jq -sRr @uri)" | jq .
```

## Notes on Parity

- Endpoint structures, field names, and status codes mirror the original Next.js API.

## Legal Notice

This is not an official repository or project of Deutsche Bahn AG or other railway companies. It is an independent project and not affiliated with or endorsed by Deutsche Bahn. To use this code or the db-vendo-client, permission from Deutsche Bahn AG may be necessary.

## License

This project is licensed under the AGPL-3.0-only. See the [LICENSE](./LICENSE) file for details.

## Credits

- Original BetterBahn by [Lukas Weihrauch](https://lukasweihrauch.de) — `https://github.com/l2xu/betterbahn`
- Uses `db-vendo-client` (ISC) by the public-transport community

---

Made with ❤️ for train travelers in Germany.
