# Shaiden

Agent harness for the Keidai platform. Connects to Torii over MCP with an opaque bearer token, discovers tools dynamically, and drives the configured task to a typed termination outcome.

## Task loop

The loop is deliberately thin: call the model (OpenRouter via the AI SDK) with Torii-discovered tools, dispatch tool calls back to Torii over the same MCP session, feed results in, repeat. Conversation state is held in memory for a single run. Every run records exactly one outcome:

| Outcome | Meaning |
|---------|---------|
| `goal_met` | Agent responded with final text (no tool calls), self-assessed against the goal |
| `iteration_exhausted` | Iteration cap reached (default 12) |
| `timeout` | Wall-clock timeout reached (default 600s) |
| `failed(reason)` | Unavailable/unsatisfiable tool call, or a model/dispatch error — fails fast |
| `human_reject` | Agent concluded the goal is unreachable after a human denial (final text prefixed with `HUMAN_REJECT:`) |

## Domain boundaries

- **Torii** owns agent identity/registration (`agent_id`, `inbound_token`), tool catalog/dispatch, and the **approval ledger** — see `apps/torii/torii.demo.yaml`
- **Shaiden** owns task execution, harness runtime, and **run visibility** (`POST /api/tasks/run`, `GET /api/runs`, SSE `/api/runs/events`)
- **Shared** (`@keidai/shared`) owns cross-app Task/Run types, schemas, and structured logging

Gated tools are declared per agent in Torii (`gated_tools` in `torii.yaml`). When the model calls a gated tool, Torii returns an `approval_required` sentinel. Shaiden parks the loop (wall-clock frozen), polls Torii's `/api/approvals/:id` for a decision via a narrow `ApprovalResumeSignal` interface, and replays the call with `approval_id` on approve. Rejections are returned to the model as a normal tool result; the agent decides whether to adapt (`goal_met`) or self-assess `human_reject`.

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
# From repo root — requires Torii running (pnpm demo:torii) and SHAIDEN_BEARER set.
cp apps/shaiden/.env.example apps/shaiden/.env
pnpm install
pnpm shaiden:dev
```

Set `SHAIDEN_BEARER` in the repo root `.env` (or `apps/shaiden/.env`). Torii must register the same token under `agents[].inbound_token` in `torii.demo.yaml`.

## Task config (v0)

Author a Task in keidai-ui (`/shaiden/tasks`) and submit it with `POST /api/tasks/run`. The body is validated with `taskSchema` (`goal`, `trigger: { type: "now" }`, `assignee`, optional `limits`). Shaiden accepts the run asynchronously (`202` + `{ runId }`) and streams progress over `GET /api/runs/events`.

A sample Task shape still lives in [`src/config/boot-task.ts`](src/config/boot-task.ts) for reference; the process no longer auto-runs it at boot.

## Docker Compose

```bash
# Requires SHAIDEN_BEARER and demo Torii secrets in the repo root .env
docker compose up --build
```

Starts Torii with `torii.demo.yaml` and the Shaiden HTTP server (awaiting task submissions from keidai-ui).

## Environment

| Variable | Description |
|----------|-------------|
| `SHAIDEN_BEARER` | Opaque mock workload identity token (passed through to Torii unchanged) |
| `SHAIDEN_AGENT_ID` | Agent id matching Torii registration (default: `shaiden-newsletter-01`) |
| `TORII_MCP_URL` | Torii MCP endpoint (default: `http://127.0.0.1:3100/mcp`) |
| `OPEN_ROUTER_API_KEY` | OpenRouter API key for the task-loop model |
| `SHAIDEN_MODEL_ID` | OpenRouter model id (default: `google/gemini-2.5-flash`) |
| `SHAIDEN_HOST` | HTTP bind host for the runs API (default: `127.0.0.1`) |
| `SHAIDEN_PORT` | HTTP bind port for the runs API (default: `3200`) |
