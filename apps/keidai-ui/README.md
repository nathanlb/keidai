# keidai-ui

Operator-facing UI for the Keidai platform.

Shared components and tokens live in `@keidai/ui` (`packages/ui`). For public
component boundaries and deployment topology, see
[Keidai architecture](../../docs/architecture.md).

## Stack

- **Client:** React 19, Vite, React Router, Tailwind 4 (via `@keidai/ui/globals.css`)
- **Dev:** Vite HMR on `:3000` + API-only Fastify BFF on `:3001` (auth, session, `/api` proxy)
- **Prod:** Fastify BFF on `:3000` — static SPA + same auth/API edge
- **Shared UI:** `@keidai/ui`

## Layout

```
src/
  shell/         # Shared app chrome (sidebar, top bar, theme, gateway status)
  agents/        # Agent management views
  connections/   # Backend connection and policy views
  oauth/         # OAuth provider views and linking flows
  home/          # Operator home views
  routes.tsx     # Route tree
server/
  ui/            # View-specific /api/ui/* aggregation routes
  # Fastify BFF auth, API proxy, and production static entry (`dev.ts` is API-only)
dist/
  client/        # Vite build output
  server/        # Compiled server entrypoints
```

## Getting started

From the monorepo root (with Fuda/Torii/Shaiden running):

```bash
pnpm install
pnpm build
pnpm --filter @keidai/keidai-ui dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google OIDC.

### Scripts

| Script | Purpose |
|--------|---------|
| `dev` | Vite HMR (`:3000`) + API-only BFF (`:3001`) |
| `dev:vite` / `dev:bff` | Run either process alone |
| `build` | Build client (`dist/client`) and server (`dist/server`) |
| `start` | Serve the production build from Fastify |
| `test` | Unit, server, and e2e tests |
| `typecheck` / `lint` | TypeScript checks for client and server |

### Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `KEIDAI_UI_HOST` | `127.0.0.1` | BFF bind address |
| `KEIDAI_UI_PORT` | `3000` | Production BFF listen port |
| `KEIDAI_UI_BFF_PORT` | `3001` | API-only BFF port used by `pnpm dev` |
| `VITE_BFF_URL` | `http://127.0.0.1:3001` | Vite proxy target for `/api`, `/auth`, `/oauth/callback` |
| `KEIDAI_UI_TORII_URL` | `http://127.0.0.1:3100` | Torii upstream for the BFF |
| `KEIDAI_UI_FUDA_URL` | `http://127.0.0.1:3300` | Fuda upstream for the BFF |
| `KEIDAI_UI_SHAIDEN_URL` | `http://127.0.0.1:3200` | Shaiden upstream for the BFF |
| `BFF_SERVICE_TOKEN` | — | Required shared secret with Torii/Fuda/Shaiden (root `.env`); injected on proxied management APIs. Opt out: `BFF_SERVICE_TOKEN_DISABLED=true` |
| `VITE_TORII_URL` / `VITE_FUDA_URL` / `VITE_SHAIDEN_URL` | — | Display-only addresses in the health footer; unset shows `<NAME> unset` |

Copy `.env.example` → `.env` and fill Google OIDC + operators path. Redirect URI stays `http://localhost:3000/auth/callback` (Vite origin; proxied to the BFF). Always open the UI as `http://localhost:3000` — not `127.0.0.1` — so OAuth matches IdP registrations and k8s.

## Server setup

**Development** (`pnpm dev`):

```
Browser → Vite (http://localhost:3000, HMR)
            ├── /api/*, /auth/*, /oauth/callback/* ──▶ BFF (127.0.0.1:3001)
            │                                            └──▶ Fuda / Torii / Shaiden
            └── SPA + HMR
```

The BFF owns operator Google OIDC, session cookies, `ownerId` enforcement on
writes, the shared `OPERATOR_API_ROUTES` reverse-proxy table, injection of
`BFF_SERVICE_TOKEN` on upstream management API calls, and view-specific
`/api/ui/*` routes that aggregate upstream data for a single screen (paths
mirror UI routes — e.g. `/shaiden/runs` → `GET /api/ui/shaiden/runs`). Vite
does not reimplement that routing.

**Production** (`pnpm start` → `dist/server/index.js`):

Same BFF on `:3000`, plus static `dist/client` with SPA fallback.

In-cluster deploy: see [`deploy/k8s/README.md`](../../deploy/k8s/README.md).
