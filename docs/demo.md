# Running the open-torii demo

End-to-end walkthrough for the NAT-16 **open-torii status digest** scenario: a demo agent connects to Torii, reads from Linear/GitHub/Notion, emails a report via Gmail, then hits a policy wall on Notion writes.

## Prerequisites

- Node.js 24, pnpm
- [uv](https://docs.astral.sh/uv/) (for the Gmail MCP server): `uvx workspace-mcp`
- OAuth apps for GitHub and Google with redirect URI **`http://127.0.0.1:8765/callback`**
- Notion uses **Notion MCP OAuth** at `https://mcp.notion.com` (no separate integration app — `torii link notion` registers a client automatically)

## Environment setup

Env is loaded in layers (see `@keidai/shared` `loadEnvForPackage`):

1. **Repo root** `.env` — shared dev secrets
2. **App** `.env` — overrides and app-specific values

Copy the examples and fill in values:

```bash
cp .env.example .env
cp apps/gateway/.env.example apps/gateway/.env
cp apps/demo-agent/.env.example apps/demo-agent/.env
```

### Root `.env` (shared)

| Variable | Purpose |
|----------|---------|
| `DEMO_AGENT_BEARER` | Static bearer for demo agent identity (gateway + demo-agent) |

### `apps/gateway/.env`

| Variable | Required for demo | Purpose |
|----------|-------------------|---------|
| `TORII_CONFIG_PATH` | yes | Use `./torii.demo.yaml` (default in example) |
| `LINEAR_API_KEY` | yes | Linear MCP `service_key` backend |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | for `torii link` | OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for `torii link` | OAuth app credentials |

Optional: `TORII_PORT`, `TORII_HOST`, `TORII_TOKEN_STORE_PATH` (defaults: `3100`, `127.0.0.1`, `./data/torii-tokens.db`).

### `apps/demo-agent/.env`

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPEN_ROUTER_API_KEY` | yes | [OpenRouter](https://openrouter.ai/) API key |
| `DEMO_OWNER_EMAIL` | yes | Digest email recipient |
| `TORII_MCP_URL` | no | Default `http://127.0.0.1:3100/mcp` |
| `DEMO_MODEL_ID` | no | Default `cohere/north-mini-code:free` |
| `DEMO_AGENT_BEARER` | no* | Only if not set in root `.env` |

\*Must match `agents[].inbound_token` in `apps/gateway/torii.demo.yaml`. Set in repo root `.env` or here as `DEMO_AGENT_BEARER`.

Inference uses [OpenRouter](https://openrouter.ai/) via the AI SDK OpenAI-compatible client. Override the model with `DEMO_MODEL_ID` (e.g. `openai/gpt-4o-mini`).

## CI without live credentials

Mocked integration tests — no API keys or OAuth:

```bash
pnpm test
```

Key test: `apps/gateway/src/mcp/tests/demo-scenario.integration.test.ts`

## One-time: OAuth linking

Link tokens for owner **`demo-owner`** (stored in `apps/gateway/data/torii-tokens.db` by default):

```bash
pnpm install

pnpm --filter @keidai/gateway run torii link github
pnpm --filter @keidai/gateway run torii link notion
pnpm --filter @keidai/gateway run torii link google
```

Each command opens a browser and completes consent on `127.0.0.1:8765`. Re-run only when tokens expire or are revoked.

## Run the demo

### Terminal A — Gmail MCP backend

```bash
uvx workspace-mcp --transport streamable-http --tools gmail
```

Listens on `http://127.0.0.1:8000/mcp` (see `torii.demo.yaml`).

### Terminal B — Torii gateway

```bash
pnpm demo:gateway
```

Expect backend connection logs and `Gateway MCP endpoint: http://127.0.0.1:3100/mcp`. JSON traces print on stdout for each tool call.

### Terminal C — Demo agent

```bash
pnpm demo
```

### What to verify

**Happy path**

- Agent gathers status from Linear, GitHub, and Notion, then emails the report via `gmail.send_gmail_message` to `DEMO_OWNER_EMAIL` in a single agent turn

**Policy denial**

- Separate follow-up attempt to post to Notion shows **`policy_denied`** for `notion.notion-create-pages`
- Notion write tools do not appear in `tools/list`

**Gateway traces**

- stdout traces for reads, Gmail send, and policy denial

### Optional smoke test

```bash
source .env  # or export DEMO_AGENT_BEARER manually

curl -s -X POST http://127.0.0.1:3100/mcp \
  -H "Authorization: Bearer $DEMO_AGENT_BEARER" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | jq .
```

Notion write tools (`notion-create-pages`, `notion-update-page`, etc.) should be absent.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `401 identity_denied` | `DEMO_AGENT_BEARER` missing or mismatch between root `.env` and what the agent sends |
| `linking_required` on GitHub/Notion/Gmail | Run `torii link <provider>` for `demo-owner` |
| Gmail backend failed at boot | `workspace-mcp` not running on port 8000 |
| `torii link` browser error | Redirect URI mismatch — GitHub/Google: `http://127.0.0.1:8765/callback`; Notion: `https://127.0.0.1:8765/callback` |
| Linear tools missing | `LINEAR_API_KEY` unset or invalid in `apps/gateway/.env` |
| Notion search denied or tool errors | Per-step summaries are always logged; set `DEMO_AGENT_VERBOSE=1` for full tool inputs/outputs |
| Config file not found | `TORII_CONFIG_PATH` should be `./torii.demo.yaml` relative to `apps/gateway/` |

## Architecture notes

- **Inbound identity:** `DEMO_AGENT_BEARER` → gateway resolves `demo-owner` via `agents[].inbound_token`
- **Outbound OAuth:** `torii link` persists tokens in SQLite; keyed by `(owner_id, provider)`
- **Production:** containers inject env per service; no `.env` files in images. Shared secrets use one K8s Secret referenced by both gateway and agent deployments.
