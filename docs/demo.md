# Running the open-torii demo

End-to-end walkthrough for the NAT-16 **open-torii status digest** scenario: a demo agent connects to Torii, reads from Linear/GitHub/Notion, creates a Gmail draft with the report, then hits a policy wall on Notion writes.

## Prerequisites

- Node.js 24, pnpm
- OAuth apps for GitHub and Google with redirect URI **`http://127.0.0.1:3100/oauth/callback/github`** and **`http://127.0.0.1:3100/oauth/callback/google`** (register in each provider's developer console)
- Notion uses **Notion MCP OAuth** at `https://mcp.notion.com` (no separate integration app — linking via the UI registers a client automatically)
- **Google managed Gmail MCP** ([developer preview](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server)):
  - Join the Google Workspace Developer Preview Program for your GCP project
  - Enable `gmail.googleapis.com` and `gmailmcp.googleapis.com`
  - Configure OAuth consent with `gmail.readonly` and `gmail.compose` scopes

## Environment setup

Env is loaded in layers (see `@keidai/shared` `loadEnvForPackage`):

1. **Repo root** `.env` — shared dev secrets
2. **App** `.env` — overrides and app-specific values

Copy the examples and fill in values:

```bash
cp .env.example .env
cp apps/torii/.env.example apps/torii/.env
cp apps/demo-agent/.env.example apps/demo-agent/.env
```

### Root `.env` (shared)

| Variable | Purpose |
|----------|---------|
| `DEMO_AGENT_BEARER` | Static bearer for demo agent identity (gateway + demo-agent) |

### `apps/torii/.env`

| Variable | Required for demo | Purpose |
|----------|-------------------|---------|
| `TORII_CONFIG_PATH` | yes | Use `./torii.demo.yaml` (default in example) |
| `LINEAR_API_KEY` | yes | Linear MCP `service_key` backend |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | for OAuth linking | OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | for OAuth linking | OAuth app credentials |

Optional: `TORII_PORT`, `TORII_HOST`, `TORII_DB_PATH` (defaults: `3100`, `127.0.0.1`, `./data/torii.db`), `TORII_GATEWAY_BASE_URL` (stable public base URL when behind a reverse proxy).

### `apps/demo-agent/.env`

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPEN_ROUTER_API_KEY` | yes | [OpenRouter](https://openrouter.ai/) API key |
| `DEMO_OWNER_EMAIL` | yes | Digest draft recipient |
| `TORII_MCP_URL` | no | Default `http://127.0.0.1:3100/mcp` |
| `DEMO_MODEL_ID` | no | Default `google/gemini-2.5-flash` |
| `DEMO_AGENT_BEARER` | no* | Only if not set in root `.env` |

\*Must match `agents[].inbound_token` in `apps/torii/torii.demo.yaml`. Set in repo root `.env` or here as `DEMO_AGENT_BEARER`.

Inference uses [OpenRouter](https://openrouter.ai/) via the AI SDK OpenAI-compatible client. Override the model with `DEMO_MODEL_ID` (e.g. `openai/gpt-4o-mini`).

## CI without live credentials

Mocked integration tests — no API keys or OAuth:

```bash
pnpm test
```

Key test: `apps/torii/src/mcp/tests/demo-scenario.integration.test.ts`

## One-time: OAuth linking

Link tokens for owner **`demo-owner`** via the **keidai-ui OAuth providers screen** (stored in `apps/torii/data/torii.db` by default):

```bash
pnpm install

# Terminal A — gateway
pnpm demo:torii

# Terminal B — UI (from repo root)
pnpm --filter @keidai/keidai-ui dev
```

Open the OAuth providers page in the UI, select owner `demo-owner`, and link GitHub, Notion, and Google. Re-link when tokens expire, are revoked, or OAuth scopes change (e.g. after switching Gmail from `gmail.send` to `gmail.compose`).

### Resetting stale OAuth registrations

If you previously linked via the old CLI loopback flow (`127.0.0.1:8765/callback`), dynamic clients (Notion) were registered with the wrong redirect URI. Clear stale registrations and tokens, then re-link via the UI:

```bash
# Default SQLite path (override with TORII_DB_PATH if set)
sqlite3 apps/torii/data/torii.db \
  "DELETE FROM oauth_provider_clients; DELETE FROM oauth_tokens;"
```

Or delete the file entirely: `rm apps/torii/data/torii.db` (recreated on next gateway boot).

## Run the demo

### Terminal A — Torii gateway

```bash
pnpm demo:torii
```

Expect backend connection logs and `Gateway MCP endpoint: http://127.0.0.1:3100/mcp`. JSON traces print on stdout for each tool call. Gmail uses Google's managed MCP at `https://gmailmcp.googleapis.com/mcp/v1` — no local sidecar.

### Terminal B — Demo agent

```bash
pnpm demo
```

### What to verify

**Happy path**

- Agent gathers status from Linear, GitHub, and Notion, then creates a Gmail draft via `gmail.create_draft` to `DEMO_OWNER_EMAIL` in a single agent turn
- Draft appears in your Gmail Drafts folder (review before sending)

**Policy denial**

- Separate follow-up attempt to post to Notion shows **`policy_denied`** for `notion.notion-create-pages`
- Notion write tools do not appear in `tools/list`

**Gateway traces**

- stdout traces for reads, Gmail draft creation, and policy denial

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
| `linking_required` on GitHub/Notion/Gmail | Link the provider via the keidai-ui OAuth providers screen for `demo-owner` |
| Gmail backend failed at boot | Gmail MCP API not enabled, preview access missing, or Google not linked via UI |
| Gmail tool errors after scope change | Re-link Google via the UI to refresh tokens with `gmail.compose` |
| Gmail `create_draft`: "The caller does not have permission" | APIs enabled but project not enrolled in [Workspace Developer Preview](https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server); for External OAuth apps, add your Google account under Test users |
| Gmail trace shows generic backend error | Gateway stdout now surfaces the MCP error text (e.g. permission denied); re-run the call and check the trace `error` field |
| OAuth `Invalid redirect_uri` (Notion) | Stale dynamic client registered with old loopback redirect — clear `oauth_provider_clients` (see reset above) and re-link via UI |
| OAuth redirect mismatch (GitHub/Google) | Provider console must list `http://127.0.0.1:3100/oauth/callback/{provider}` |
| Linear tools missing | `LINEAR_API_KEY` unset or invalid in `apps/torii/.env` |
| Notion search denied or tool errors | Per-step summaries are always logged; set `DEMO_AGENT_VERBOSE=1` for full tool inputs/outputs |
| Config file not found | `TORII_CONFIG_PATH` should be `./torii.demo.yaml` relative to `apps/torii/` |

## Architecture notes

- **Inbound identity:** `DEMO_AGENT_BEARER` → gateway resolves `demo-owner` via `agents[].inbound_token`
- **Outbound OAuth:** UI linking persists tokens in SQLite; keyed by `(owner_id, provider)`
- **OAuth callbacks:** Gateway derives `{base}/oauth/callback/{provider}` — configure `gateway_base_url` in torii.yaml or `TORII_GATEWAY_BASE_URL` when behind a proxy
- **Gmail:** hosted remote MCP (like Notion) — Torii forwards bearer tokens from UI-linked Google OAuth; no local `workspace-mcp` process
- **Production:** containers inject env per service; no `.env` files in images. Shared secrets use one K8s Secret referenced by both gateway and agent deployments.
