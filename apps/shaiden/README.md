# Shaiden

Agent runtime for the Keidai ecosystem. Exchanges a subject token with Fuda for a short-lived agent JWT, connects to Torii over MCP with that JWT, discovers tools dynamically, and drives the configured task to a typed termination outcome.

## Task loop

The loop is deliberately thin: call the model (OpenRouter via the AI SDK) with Torii-discovered tools, dispatch tool calls back to Torii over the same MCP session, feed results in, repeat. Conversation state is held in memory for a single run and checkpointed to persistent storage for terminal continuations. Every run records exactly one outcome:

| Outcome | Meaning |
|---------|---------|
| `goal_met` | Agent called `report_step_assessment` with `status: goal_met`, or returned final text when assessment was omitted |
| `iteration_exhausted` | Iteration cap reached (default 12) |
| `timeout` | Wall-clock timeout reached (default 600s) |
| `failed(reason)` | Harness-level failure (model unreachable, operator cancel, session/connect error, Fuda token exchange failure, policy denial on approval resume), or agent self-assessed give-up (`status: cannot_complete`). Per-call tool errors are fed back to the model as tool results so the agent can retry or adapt. |
| `human_reject` | Human denied a gated tool call — the harness terminates immediately; the model does not decide |

Working steps continue implicitly when the model calls Torii tools. `report_step_assessment` is terminal-only (`goal_met` | `cannot_complete`) and should not be called alongside other tools.

### Credentials

| Call | Credential |
|------|------------|
| Shaiden → Fuda (`POST /token`) | Subject token (`SHAIDEN_BEARER`; static in v0) |
| Shaiden → Torii (tools/list, tools/call) | Fuda-minted agent JWT (`aud=torii`, ~5 min TTL) |

Tokens are minted when the harness needs Torii credentials and reminted when near expiry or on resume from `waiting_approval`, so a long-parked task picks up revoked grants and group changes. Fuda unreachable at first mint fails the run clearly; mid-run Fuda outages keep a still-valid cached JWT.

### Evals (NAT-112)

Eval suites live in `eval/`, separate from unit tests. They are **not** run by `pnpm test`. They cover stochastic self-assessment through the real harness (Torii MCP + model); deterministic limit/timeout/connectivity cases stay in `src/**/tests/**`.

- `pnpm --filter @keidai/shaiden eval` — live harness evals (requires `OPEN_ROUTER_API_KEY`)

See `eval/README.md` for stack details.

CI gate: `.github/workflows/shaiden-termination-eval.yml` runs `eval` on PRs that touch DECIDE / termination paths.

## Domain boundaries

- **Torii** owns tool catalog/dispatch, group-based policy, and the **approval ledger** — see `apps/torii/torii.demo.yaml`
- **Fuda** owns agent identity/registration — see `apps/fuda/fuda.seed.example.yaml`
- **Shaiden** owns task execution, harness runtime, and **run visibility** (`POST /api/tasks/run`, `GET /api/runs`, SSE `/api/runs/events`)
- **Shared** (`@keidai/shared`) owns cross-app Task/Run types, schemas, and structured logging

Gated tools are declared in Torii operator config (`gated_tools` in `torii.yaml`, keyed by Fuda agent id). When the model calls a gated tool, Torii returns an `approval_required` sentinel. Shaiden parks the loop (wall-clock frozen) and waits for an MCP `notifications/approval_decided` push on the open Torii session, then remints credentials and replays the call with `approval_id` on approve. On reject, the harness records the denial in history and terminates as `human_reject` immediately — denials are not fed back to the model. A replay that fails Torii policy after remint terminates as `failed(reason)` with a policy-denial message (distinct from transport failure).

If the MCP session drops while parked, the wait fails and the run terminates as `failed` (the approval decision may still be recorded in Torii's ledger for UI/audit).

Opaque correlation refs (`_torii_run_id`, `_torii_step_id`) are attached to gated calls so Torii can echo them on the ledger without interpreting run/step semantics.
## Log streams

During normal harness operation Shaiden emits structured operational logs to **stderr**, using the same `StructuredLogger` from `@keidai/shared` as Torii:

| Stream | Content | Schema |
|--------|---------|--------|
| **stderr** | Structured operational logs (boot, run lifecycle, tool dispatch, approvals) | JSON with `recordType: "log"`, `level`, and `event` |

Events follow a `domain.action` naming convention (`boot.*`, `run.*`). Tool call audit records (`CallTrace`) are emitted by Torii on stdout when Shaiden dispatches through MCP — Shaiden does not duplicate them.

Local `pnpm shaiden:dev` output is JSON lines on stderr, not human-readable prose.

## Local development

```bash
# From repo root — requires Fuda + Torii running and SHAIDEN_BEARER / FUDA_URL set.
cp apps/shaiden/.env.example apps/shaiden/.env
pnpm install
pnpm shaiden:dev
```

Set `SHAIDEN_BEARER` (subject token) and `FUDA_URL` in the repo root `.env` (or `apps/shaiden/.env`). Shaiden exchanges the subject token for an agent JWT via Fuda `POST /token` before calling Torii. Local demo seeds map the bearer through Fuda's subject validator.

## Task config (v0)

Author a Task in keidai-ui (`/shaiden/tasks`) and submit it with `POST /api/tasks/run` (create saved task + start run) or run a saved task with `POST /api/tasks/:taskId/run`. The body is validated with `taskSchema` (`goal`, `trigger: { type: "now" }`, `assignee`, optional `limits`). Shaiden accepts the run asynchronously (`202` + `{ runId, taskId }`) and streams progress over `GET /api/runs/events`.

Saved tasks are listed at `GET /api/tasks` and persist in SQLite (`SHAIDEN_DB_PATH`). Runs store a task snapshot at start time so later task edits do not rewrite history.

### Follow-up messages on stopped runs

`POST /api/runs/:runId/follow-up` with `{ "message": "..." }` appends a user follow-up to an existing run and resumes the same run record:

| Run state | Behavior |
|-----------|----------|
| `waiting_approval` | Message is queued for the parked loop and recorded in the run log; approval is unchanged |
| Terminal (`failed`, `goal_met`, `iteration_exhausted`, `timeout`) | Run reopens, message is appended, and the loop resumes with persisted conversation history |

Iteration cap and wall-clock timeout reset on each terminal continuation. Runs created before conversation-history persistence was added cannot be resumed (`409`). If the process restarts while a run is parked on approval, the in-memory follow-up channel is lost (`409`). `human_reject` continuations are not supported in v0.

Conversation history is checkpointed during execution and stored in SQLite (`conversation_history_json`) so terminal resumes can rebuild the model transcript. The run log records `user_message` and `outcome` milestone steps so prior outcomes remain visible after a continuation.

A sample Task shape still lives in [`src/config/boot-task.ts`](src/config/boot-task.ts) for reference; the process no longer auto-runs it at boot.

## Docker Compose

```bash
# Requires SHAIDEN_BEARER, FUDA_ISSUER, apps/fuda/keys/dev.pem, and demo Torii
# secrets in the repo root .env. Seed agents/grants after first boot (empty DB
# otherwise fails token exchange):
#   pnpm --filter @keidai/fuda seed -- ./apps/fuda/fuda.seed.example.yaml
# (point FUDA_DB_PATH at the compose volume, or use the management API)
docker compose up --build
```

Starts **Fuda** (identity / token exchange on `:3300`), **Torii** (`torii.demo.yaml`, JWKS from Fuda), and the **Shaiden** HTTP server (awaiting task submissions from keidai-ui).## Environment

| Variable | Description |
|----------|-------------|
| `SHAIDEN_BEARER` | Subject token for Fuda token exchange (static shared secret in v0) |
| `FUDA_URL` | Fuda base URL for `POST /token` (e.g. `http://127.0.0.1:3300`) |
| `SHAIDEN_AGENT_ID` | Agent id requested in token exchange (default: `shaiden-newsletter-01`) |
| `TORII_MCP_URL` | Torii MCP endpoint (default: `http://127.0.0.1:3100/mcp`) |
| `OPEN_ROUTER_API_KEY` | OpenRouter API key for the task-loop model |
| `SHAIDEN_MODEL_ID` | OpenRouter model id (default: `google/gemini-2.5-flash`) |
| `SHAIDEN_HOST` | HTTP bind host for the runs API (default: `127.0.0.1`) |
| `SHAIDEN_PORT` | HTTP bind port for the runs API (default: `3200`) |
| `SHAIDEN_DB_PATH` | SQLite path for saved tasks and run history (default: `./data/shaiden.db`) |
