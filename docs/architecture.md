# Architecture

Keidai separates agent identity, tool access, execution, and operator access
into services with explicit trust boundaries.

```text
Operator browser → keidai-ui BFF → Fuda / Torii / Shaiden
                                    ↑       ↑
                    agent identity JWT ─────┘
Shaiden → Fuda /token → Fuda-minted JWT → Torii MCP → backend MCP servers
```

Only keidai-ui is a browser-facing edge in Docker Compose and Kubernetes.
Fuda, Torii, and Shaiden use private service URLs.

## Components

### keidai-ui — operator BFF and SPA

keidai-ui authenticates operators with Google OIDC, enforces the operator's
`owner_id` on writes, and proxies browser requests to the internal services.
It also exposes view-specific `/api/ui/*` endpoints that aggregate data for a
screen. It is not the source of agent identity or tool authorization.

### Fuda — agent identity provider

Fuda stores agents, bearer grants, and versioned personas. It exchanges a
platform subject credential for a short-lived agent JWT. Torii validates that
JWT offline with Fuda's JWKS; it does not ask Fuda to authorize every tool call.

The platform subject maps to the `shaiden-runner` bearer. Creating an agent
grants that bearer permission to act as the agent.

### Torii — MCP gateway and control plane

Torii provides one MCP endpoint for agents and fans out to configured backend
MCP servers. It resolves backend credentials without exposing them to the
agent, evaluates persisted group policy, owns approval gates and their ledger,
and records call traces.

Torii requires Postgres for policy, OAuth state, approval records, and traces.
Its boot-time `torii.yaml` config describes backend connections; it is not the
complete source of runtime policy.

### Shaiden — agent runtime

Shaiden runs saved tasks through a model and Torii's discovered tools. It
persists tasks and runs in Postgres. When Torii returns a gated MCP task,
Shaiden parks and later resumes the run; Torii remains responsible for the
approval decision and ledger.

## Credential boundaries

| Hop | Credential | Owner |
| --- | --- | --- |
| Browser → keidai-ui | Google OIDC session | keidai-ui |
| keidai-ui → management APIs | `BFF_SERVICE_TOKEN` | deployment operator |
| Shaiden → Fuda `/token` | local shared secret or projected SA token | Fuda subject validator |
| Shaiden → Torii | short-lived Fuda JWT | Fuda |
| Torii → backend MCP server | `user_oauth`, `service_key`, or `none` | Torii |

Backend credentials are never sent to Shaiden or the browser. Unknown agent
groups fail closed in Torii.
