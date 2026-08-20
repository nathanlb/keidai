# Shaiden

Agent runtime for the Keidai ecosystem. Exchanges a subject token with Fuda for a short-lived agent JWT, connects to Torii over MCP with that JWT, discovers tools dynamically, and drives the configured task to a typed termination outcome.

## Task loop

The loop is deliberately thin: call the model (OpenRouter via the AI SDK) with Torii-discovered tools, dispatch tool calls back to Torii over MCP (per-request caller; not a held protocol session), feed results in, repeat. Conversation state is persisted per run in Postgres and used to continue that same run after a terminal outcome. At most one run may be `running` for a given saved task (enforced in the store). Different saved tasks may run at the same time, including across Shaiden replicas. Every run records exactly one outcome:

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
| Shaiden → Fuda (`POST /token`) | Subject token (`SHAIDEN_BEARER` locally, or projected SA file via `SHAIDEN_SUBJECT_TOKEN_FILE` in-cluster) |
| Shaiden → Torii (tools/list, tools/call) | Fuda-minted agent JWT (`aud=torii`, ~5 min TTL) |

Tokens are minted when the harness needs Torii credentials and reminted when near expiry, including on each `tasks/get` poll while parked, so a long-parked task picks up revoked grants and group changes. Fuda unreachable at first mint fails the run clearly; mid-run Fuda outages keep a still-valid cached JWT.

### Evals (NAT-112)

Eval suites live in `eval/`, separate from unit tests. They are **not** run by `pnpm test`. They cover stochastic self-assessment through the real harness (Torii MCP + model); deterministic limit/timeout/connectivity cases stay in `src/**/tests/**`.

- `pnpm --filter @keidai/shaiden eval` — live harness evals (requires `OPEN_ROUTER_API_KEY`)

See `eval/README.md` for stack details.

CI gate: `.github/workflows/shaiden-termination-eval.yml` runs `eval` on PRs that touch DECIDE / termination paths.

## Domain boundaries

- **Torii** owns tool catalog/dispatch, group-based policy, and the **approval ledger** — see `apps/torii/torii.demo.yaml`
- **Fuda** owns agent identity/registration — create agents via keidai-ui / management API
- **Shaiden** owns task execution, harness runtime, and **run visibility** (`POST /api/tasks/run`, `GET /api/runs`, SSE `/api/runs/events`)
- **Shared** (`@keidai/shared`) owns cross-app Task/Run types, schemas, and structured logging

Gated tools are declared in Torii operator config (`gated_tools` in `torii.yaml`, keyed by Fuda agent id). When the model calls a gated tool, Torii returns a task-augmented `tools/call` result (`resultType: "task"`). Shaiden parks the loop (wall-clock frozen), persists the MCP task id on the run, and polls `tasks/get` at the server's `pollIntervalMs` — no held connection to Torii, and a dropped poll is a retry. The completed task's `result` is the tool result; there is no `approval_id` replay. A denial arrives as a `completed` task with a denial-shaped payload and terminates as `human_reject` immediately — denials are not fed back to the model. A `cancelled` task fails the run. A post-approval policy denial terminates as `failed(reason)` with a policy-denial message (distinct from transport failure).

Killing Shaiden mid-pause resumes the parked run from the persisted task id. Killing Torii mid-pause does not fail the run; the next poll retries.

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

Set `SHAIDEN_BEARER` (subject token) and `FUDA_URL` in the repo root `.env` (or `apps/shaiden/.env`). `SHAIDEN_DATABASE_URL` is required. Local Postgres: `docker compose up postgres -d`. Shaiden exchanges the subject token for an agent JWT via Fuda `POST /token` before calling Torii. Fuda allow-lists the secret and treats it as the platform bearer `shaiden-runner`.

## Task config (v0)

Author a Task in keidai-ui (`/shaiden/tasks`) and submit it with `POST /api/tasks/run` (create saved task + start run) or run a saved task with `POST /api/tasks/:taskId/run`. The body is validated with `taskSchema` (`goal`, `trigger: { type: "now" }`, `assignee`, optional `limits`). Shaiden accepts the run asynchronously (`202` + `{ runId, taskId }`) and streams progress over `GET /api/runs/events`.

Saved tasks are listed at `GET /api/tasks` and persist in Postgres (`SHAIDEN_DATABASE_URL`). Runs store a task snapshot at start time so later task edits do not rewrite history.

### Follow-up messages on stopped runs

`POST /api/runs/:runId/follow-up` with `{ "message": "..." }` appends a user follow-up to an existing run and resumes the same run record:

| Run state | Behavior |
|-----------|----------|
| `waiting_approval` | Message is queued in the run store (any replica can accept it) and recorded in the run log; approval is unchanged |
| Terminal (`failed`, `goal_met`, `iteration_exhausted`, `timeout`) | Run reopens, message is appended, and the loop resumes with persisted conversation history |

Iteration cap and wall-clock timeout reset on each terminal continuation. Runs created before conversation-history persistence was added cannot be resumed (`409`). If the process restarts while a run is parked on approval, polling resumes from the persisted MCP task id; queued follow-ups persist in Postgres and are drained before the next model call. A replica claims a parked run with a short lease so two processes cannot drive it at once — another replica may reclaim after the lease expires. `human_reject` continuations are not supported in v0.

Conversation history is checkpointed during execution and stored in Postgres (`conversation_history_json`) so terminal resumes can rebuild the model transcript. The run log records `user_message` and `outcome` milestone steps so prior outcomes remain visible after a continuation.

A sample Task shape still lives in [`src/config/boot-task.ts`](src/config/boot-task.ts) for reference; the process no longer auto-runs it at boot.

## Docker Compose

```bash
# Requires SHAIDEN_BEARER, FUDA_ISSUER, apps/fuda/keys/dev.pem, and demo Torii
# secrets in the repo root .env. Fuda seeds shaiden-runner and grants it to
# every agent at boot / on create.
docker compose up --build
```

Starts **Postgres**, **Fuda** (identity / token exchange on `:3300`), **Torii** (`torii.demo.yaml`, JWKS from Fuda), and the **Shaiden** HTTP server (awaiting task submissions from keidai-ui).

## Environment

| Variable | Description |
|----------|-------------|
| `SHAIDEN_BEARER` | Subject token for Fuda token exchange (static shared secret; local/compose) |
| `SHAIDEN_SUBJECT_TOKEN_FILE` | Path to projected SA token file (cluster). Exactly one of bearer or file |
| `FUDA_URL` | Fuda base URL for `POST /token` (e.g. `http://127.0.0.1:3300`) |
| `TORII_MCP_URL` | Torii MCP endpoint (default: `http://127.0.0.1:3100/mcp`) |
| `OPEN_ROUTER_API_KEY` | OpenRouter API key for the task-loop model |
| `SHAIDEN_MODEL_ID` | OpenRouter model id (default: `google/gemini-2.5-flash`) |
| `SHAIDEN_HOST` | HTTP bind host for the runs API (default: `127.0.0.1`) |
| `SHAIDEN_PORT` | HTTP bind port for the runs API (default: `3200`) |
| `SHAIDEN_DATABASE_URL` | Postgres connection string for saved tasks and run history (required) |
| `SHAIDEN_REPLICA_ID` | Optional stable replica id for run leases (default: a UUID at boot) |
