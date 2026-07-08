# Shaiden

Agent harness for the Keidai platform. Connects to Torii over MCP with an opaque bearer token, discovers tools dynamically, and drives the configured task to a typed termination outcome.

## Task loop

The loop is deliberately thin: call the model (OpenRouter via the AI SDK) with Torii-discovered tools, dispatch tool calls back to Torii over the same MCP session, feed results in, repeat. Conversation state is held in memory for a single run. Every run records exactly one outcome:

| Outcome | Meaning |
|---------|---------|
| `goal_met` | Agent responded with final text (no tool calls), self-assessed against the goal |
| `iteration_exhausted` | Iteration cap reached (default 25) |
| `timeout` | Wall-clock timeout reached (default 600s) |
| `failed(reason)` | Unavailable/unsatisfiable tool call, or a model/dispatch error — fails fast |
| `human_reject` | Agent concluded the goal is unreachable after a human denial (final text prefixed with `HUMAN_REJECT:`) |

Gated tools are declared per agent in Torii (`gated_tools` in `torii.yaml`). When the model calls a gated tool, Torii returns an `approval_required` sentinel. Shaiden parks the loop (wall-clock frozen), polls Torii's `/api/approvals/:id` for a decision, and replays the call with `approval_id` on approve. Rejections are returned to the model as a normal tool result; the agent decides whether to adapt (`goal_met`) or self-assess `human_reject`.

**Domain boundaries:**
- **Torii** owns agent identity/registration (`agent_id`, `inbound_token`) — see `apps/gateway/torii.demo.yaml`
- **Shaiden** owns task definition and harness runtime
- **Shared** (`@keidai/shared`) owns cross-app Task/Run types and schemas

## Local development

```bash
# From repo root — requires Torii running (pnpm demo:gateway) and SHAIDEN_BEARER set.
cp apps/shaiden/.env.example apps/shaiden/.env
pnpm install
pnpm shaiden:dev
```

Set `SHAIDEN_BEARER` in the repo root `.env` (or `apps/shaiden/.env`). Torii must register the same token under `agents[].inbound_token` in `torii.demo.yaml`.

## Task config (interim)

The boot task lives in [`src/config/boot-task.ts`](src/config/boot-task.ts) and is validated with `taskSchema` at startup. This will move to a SQLite-backed task store later.

## Docker Compose

```bash
# Requires SHAIDEN_BEARER and demo Torii secrets in the repo root .env
docker compose up --build
```

Starts Torii with `torii.demo.yaml` and runs the Shaiden harness once tool discovery completes.

## Environment

| Variable | Description |
|----------|-------------|
| `SHAIDEN_BEARER` | Opaque mock workload identity token (passed through to Torii unchanged) |
| `SHAIDEN_AGENT_ID` | Agent id matching Torii registration (default: `shaiden-newsletter-01`) |
| `TORII_MCP_URL` | Torii MCP endpoint (default: `http://127.0.0.1:3100/mcp`) |
| `OPEN_ROUTER_API_KEY` | OpenRouter API key for the task-loop model |
| `SHAIDEN_MODEL_ID` | OpenRouter model id (default: `google/gemini-2.5-flash`) |
