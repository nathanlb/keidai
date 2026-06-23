# keidai-ui

Operator-facing UI for the Keidai platform.

Design reference: [keidai-ui — Frontend](https://app.notion.com/p/keidai-ui-Frontend-38507ec181ff81b38d8df7349de05381). Shared components and tokens live in `@keidai/ui` (`packages/ui`).

## Stack

- **Client:** React 19, Vite, React Router, Tailwind 4 (via `@keidai/ui/globals.css`)
- **Server:** Fastify 5 — dev proxy to Vite, prod static serving with SPA fallback
- **Shared UI:** `@keidai/ui`

## Layout

```
src/           # React app (routes, pages, modules)
server/        # Fastify server (create-server, dev entry, prod entry)
dist/
  client/      # Vite build output
  server/      # Compiled server entrypoints
```

## Getting started

From the monorepo root:

```bash
pnpm install
pnpm build
pnpm --filter @keidai/keidai-ui dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Scripts

| Script | Purpose |
|--------|---------|
| `dev` | Start Vite + Fastify dev proxy |
| `build` | Build client (`dist/client`) and server (`dist/server`) |
| `start` | Serve the production build from Fastify |
| `test` | Server integration tests (builds first) |
| `typecheck` / `lint` | TypeScript checks for client and server |

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `KEIDAI_UI_HOST` | `127.0.0.1` | Fastify bind address |
| `KEIDAI_UI_PORT` | `3000` | Fastify listen port |

Vite always binds to `127.0.0.1:5173` in dev (see `vite.config.ts`).

## Proxy server setup

`server/create-server.ts` is the single factory for both dev and prod. The goal is one stable origin (`KEIDAI_UI_HOST`:`KEIDAI_UI_PORT`) whether you are developing or serving a build — matching how Torii will host the UI later.

**Development** (`pnpm dev` → `server/dev.ts`):

1. Spawns the Vite dev server on `127.0.0.1:5173`.
2. Waits until Vite responds.
3. Starts Fastify with `@fastify/http-proxy`, forwarding all requests (including WebSocket HMR) to Vite.

You browse Fastify on port 3000; Vite handles transforms and hot reload behind the proxy.

**Production** (`pnpm start` → `dist/server/index.js`):

1. Fastify registers `@fastify/static` against `dist/client`.
2. Unknown `GET` routes without a file extension fall through to `index.html` so React Router client routes work after a refresh.

```
Browser → Fastify (:3000)
            ├─ dev:  proxy → Vite (:5173)
            └─ prod: static files from dist/client + SPA fallback
```

Future Torii integration will reuse this server factory: the gateway Fastify instance can register the same static/proxy behaviour alongside `/mcp` and `/api/*` routes.
