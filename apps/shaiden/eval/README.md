# Shaiden evals

Eval suites live here, separate from `src/**/tests/**` unit and integration tests.

**Evals are not run by `pnpm test`.** They exercise the real harness (Torii MCP + model + dispatch) and cover the stochastic self-assessment path. Deterministic loop limits (iteration cap, timeout, connectivity) stay in unit/integration tests under `src/`.

## Commands

| Command | What it runs |
|---------|----------------|
| `pnpm eval` | Live harness evals (`eval/**/*.live.eval.ts`) — requires `OPEN_ROUTER_API_KEY` |

## Live eval stack

`eval/helpers/torii-eval-stack.ts` boots an **in-process Torii gateway** wired to **mock MCP backends** with deterministic tool handlers. Shaiden connects over the same MCP/HTTP path as production (`startHarnessRun` → `connectToriiSession` → `createHarnessToolDispatcher`), so tool dispatch, approvals, and recording are real; only downstream connector payloads are fixed.

### Environment

Loaded automatically from the repo root `.env` then `apps/shaiden/.env` (same as `pnpm shaiden:dev`), via `eval/load-env.ts`.

| Variable | Required for `pnpm eval` | Notes |
|----------|--------------------------|-------|
| `OPEN_ROUTER_API_KEY` | yes | Real model calls |
| `SHAIDEN_BEARER` | no | Eval stack uses `FixedIdentityResolver` |
| `SHAIDEN_MODEL_ID` | no | Default `google/gemini-2.5-flash` |

## Layout

| Path | Purpose |
|------|---------|
| `termination/live/` | NAT-112 termination scenarios through the real harness |
| `helpers/` | Eval stack, live harness runner, assertions |

Harness primitives shared with unit tests: `src/run/testing/task-loop-harness.ts`.

## CI

`.github/workflows/shaiden-termination-eval.yml` runs `pnpm eval` when DECIDE / termination paths change. Needs `OPEN_ROUTER_API_KEY` in CI secrets.
