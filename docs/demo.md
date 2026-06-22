# Running the open-torii demo

End-to-end walkthrough for the NAT-16 **open-torii status digest** scenario: a demo agent connects to Torii, reads from Linear/GitHub/Notion, emails a report via Gmail, then hits a policy wall on Notion writes.

## Prerequisites

- Node.js 24, pnpm
- [uv](https://docs.astral.sh/uv/) (for the Gmail MCP server): `uvx workspace-mcp`
- OAuth apps for GitHub, Notion, and Google with redirect URI **`http://127.0.0.1:8765/callback`**

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
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | for `torii link` | OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for `torii link` | OAuth app credentials |

Optional: `TORII_PORT`, `TORII_HOST`, `TORII_TOKEN_STORE_PATH` (defaults: `3100`, `127.0.0.1`, `./data/torii-tokens.db`).

### `apps/demo-agent/.env`

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | yes | Claude API key |
| `DEMO_OWNER_EMAIL` | yes | Digest email recipient |
| `TORII_MCP_URL` | no | Default `http://127.0.0.1:3100/mcp` |
| `DEMO_AGENT_BEARER` | no* | Only if not set in root `.env` |

\*Must match `agents[].inbound_token` in `apps/gateway/torii.demo.yaml` (resolved at gateway boot).

## CI without live credentials

Mocked integration tests — no API keys or OAuth:

```bash
pnpm test
```

Key test: `apps/gateway/src/mcp/tests/demo-scenario.integration.test.ts`

## One-time: OAuth linking

Link tokens for owner **`demo-owner`** (stored in `apps/gateway/data/torii-tokens.db` by default):

```bash
pnpm install && pnpm build

pnpm --filter @keidai/gateway exec torii link github
pnpm --filter @keidai/gateway exec torii link notion
pnpm --filter @keidai/gateway exec torii link google
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

- Agent calls read tools on Linear, GitHub, and Notion
- Report includes `## Linear`, `## GitHub`, `## Notion` and a `NAT-*` issue id
- Email sent via `gmail.send_gmail_message` to `DEMO_OWNER_EMAIL`

**Policy denial**

- Follow-up attempt to post to Notion shows **`policy_denied`** for `notion.notion-create-pages`
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
| `torii link` browser error | Redirect URI not registered as `http://127.0.0.1:8765/callback` |
| Linear tools missing | `LINEAR_API_KEY` unset or invalid in `apps/gateway/.env` |
| Config file not found | `TORII_CONFIG_PATH` should be `./torii.demo.yaml` relative to `apps/gateway/` |

## Architecture notes

- **Inbound identity:** `DEMO_AGENT_BEARER` → gateway resolves `demo-owner` via `agents[].inbound_token`
- **Outbound OAuth:** `torii link` persists tokens in SQLite; keyed by `(owner_id, provider)`
- **Production:** containers inject env per service; no `.env` files in images. Shared secrets use one K8s Secret referenced by both gateway and agent deployments.
