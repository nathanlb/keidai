# Testing methodology

Keidai UI (`apps/keidai-ui`) uses a layered test stack aligned with modern Vite + React practice:

- **Vitest** for unit and component tests
- **Vitest browser mode** (Playwright-backed Chromium) for components that need a real DOM
- **Playwright** for integration and end-to-end flows across routing, shell state, and gateway-backed pages

## Testing pyramid

```
         [E2E / Integration]      ← Playwright: full user flows
        [Component (browser)]     ← vitest-browser-react: real DOM components
       [Unit (jsdom)]             ← Vitest + RTL: logic, hooks, utilities
```

Keep the pyramid healthy: many fast unit tests at the base, a small set of browser component tests where jsdom is insufficient, and a focused suite of Playwright specs for critical paths.

## File layout and naming

Tests live in a `tests/` folder beside the module under test — the same layout used in `apps/torii` and other monorepo packages.

```
src/shell/utils/
  derive-owner-initials.ts
  tests/
    derive-owner-initials.test.ts
```

| Test type | Location / suffix | Runner |
| -- | -- | -- |
| Pure logic / hooks | `tests/*.test.ts(x)` | Vitest (jsdom) |
| Component with real DOM needs | `tests/*.browser.test.tsx` | Vitest browser mode |
| Full user flows | `e2e/*.spec.ts` | Playwright |

Server-side Fastify tests live under `server/tests/` and run with Node's built-in test runner via `pnpm test:server`.

## Running tests

From `apps/keidai-ui`:

```bash
pnpm test              # Vitest (unit + browser) and server tests
pnpm test:unit         # jsdom unit tests only
pnpm test:browser      # Vitest browser mode only
pnpm test:coverage     # Vitest with V8 coverage
pnpm test:server       # Fastify server tests (builds first)
pnpm test:e2e          # Playwright integration tests
pnpm test:ui           # Vitest UI
pnpm test:e2e:ui       # Playwright UI
```

Playwright starts `pnpm exec tsx server/dev.ts` automatically (Fastify on port 3000 proxying Vite). In CI, browsers are installed before the test job runs.

## Guiding principles

- **Test behavior, not implementation.** Query by role, label, or visible text — not class names or component internals.
- **Default to jsdom.** Use Vitest browser mode only when a component exercises a Web API that jsdom cannot simulate reliably.
- **Integration tests are not unit tests.** Playwright specs should cover cross-page flows and mocked gateway responses, not re-assert logic already covered in Vitest.
- **Mock the gateway at the network boundary in E2E.** Route `/api/config/*` in Playwright so flows do not depend on a live Torii gateway process.

## What to test

- Pure utilities (`deriveOwnerInitials`, `groupAgentsByOwner`, `formatAgentSubject`)
- Reducers and navigation helpers
- Hooks with mocked data sources (`useActingOwner`)
- Shell flows: routing, theme persistence, agents page empty and populated states

## What not to test

- Snapshot tests for layout (brittle, low signal)
- Internal React state directly
- Third-party library behavior (`swr`, Fastify plugins, etc.)
- Live gateway behavior in the UI package (belongs in gateway integration tests)

## CI

The root `pnpm test` runs through Turborepo. Keidai UI's `test` script runs Vitest and server tests; Playwright is installed in CI before the test step so browser mode and E2E can use Chromium.
