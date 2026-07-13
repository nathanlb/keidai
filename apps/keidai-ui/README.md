# keidai-ui

Operator-facing UI for the Keidai platform.

Design reference: [keidai-ui — Frontend](https://app.notion.com/p/keidai-ui-Frontend-38507ec181ff81b38d8df7349de05381). Shared components and tokens live in `@keidai/ui` (`packages/ui`).

## Stack

- **Client:** React 19, Vite, React Router, Tailwind 4 (via `@keidai/ui/globals.css`)
- **Dev server:** Vite (serves the client, HMR, and proxies `/api` to the gateway)
- **Prod server:** Fastify 5 — static serving with SPA fallback (also reused by Torii)
- **Shared UI:** `@keidai/ui`

## Layout

```
src/
  shell/         # Shared app chrome (sidebar, top bar, theme, gateway status)
  torii/         # Torii module (nav, pages, layout)
  routes.tsx     # Route tree
server/          # Fastify prod server (create-server: static + SPA fallback, prod entry)
dist/
  client/        # Vite build output
  server/        # Compiled server entrypoints
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
| `dev` | Start the Vite dev server on `:3000` |
| `build` | Build client (`dist/client`) and server (`dist/server`) |
| `start` | Serve the production build from Fastify |
| `test` | Server integration tests (builds first) |
| `typecheck` / `lint` | TypeScript checks for client and server |

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `KEIDAI_UI_HOST` | `127.0.0.1` | Prod Fastify bind address |
| `KEIDAI_UI_PORT` | `3000` | Prod Fastify listen port |
| `VITE_TORII_URL` | `http://127.0.0.1:3100` | Torii gateway origin for the dev `/api` proxy and health footer display |
| `VITE_SHAIDEN_URL` | `http://127.0.0.1:3200` (dev proxy) / unset (same-origin) | Shaiden origin for task/run APIs; Vite proxies `/api/tasks`, `/api/runs`, and `/api/shaiden/health` in dev when unset client-side |

The dev server (Vite) binds to `127.0.0.1:3000` — see `vite.config.ts`.

## Server setup

**Development** (`pnpm dev` → `vite`):

Vite serves the client with HMR on `127.0.0.1:3000`, proxies `/api/tasks`,
`/api/runs`, and `/api/shaiden/health` to `VITE_SHAIDEN_URL`, and proxies other
`/api` paths to `VITE_TORII_URL` (see `vite.config.ts`). Client-side routes
fall back to `index.html` automatically. There is no separate server process to
manage.

**Production** (`pnpm start` → `dist/server/index.js`):

`server/create-server.ts` exposes `registerUiStatic(app, { clientRoot })`, a
Fastify plugin that serves `dist/client` and falls back to `index.html` for
extensionless `GET` routes so React Router routes survive a refresh.
`server/index.ts` is a thin standalone preview server that registers it.

```
dev   Browser → Vite (:3000) ── /api/tasks,/api/runs,/api/shaiden/health ──▶ shaiden (:3200)
                         └── /api/* ──▶ gateway (:3100)
prod  Browser → Torii static UI; run fetches → Shaiden (`VITE_SHAIDEN_URL`)
```

### Torii integration (v0)

When Torii serves the UI, it registers the same plugin on its own Fastify
instance next to `registerGatewayRoutes(app, controllers)`:

```ts
await registerUiStatic(app, { clientRoot: "<keidai-ui>/dist/client" });
```

One origin then serves `/mcp`, `/api/*`, and the SPA. At that point
`registerUiStatic` moves into a shared server package so `apps/torii` imports
it directly rather than reaching across apps. No dev-only proxy code is involved.
