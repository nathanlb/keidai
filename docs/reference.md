# Deployment reference

This page is the public reference for values that are shared between services.
Service-specific configuration remains documented beside its source.

## Public URLs and ports

| Surface | Native development | Compose / Kubernetes |
| --- | --- | --- |
| keidai-ui browser edge | `http://localhost:3000` | `http://localhost:3000` |
| keidai-ui API-only BFF | `http://127.0.0.1:3001` | not exposed separately |
| Torii | `http://127.0.0.1:3100` | internal |
| Shaiden | `http://127.0.0.1:3200` | internal |
| Fuda | `http://127.0.0.1:3300` | internal |

When keidai-ui is the browser edge, use its origin for both operator and
backend OAuth redirects:

```text
http://localhost:3000/auth/callback
http://localhost:3000/oauth/callback/{provider}
```

## Shared environment ownership

| Value | Set by | Consumed by | Notes |
| --- | --- | --- | --- |
| `BFF_SERVICE_TOKEN` | deployment operator | keidai-ui, Fuda, Torii, Shaiden | One shared management-API credential |
| `FUDA_ISSUER` / `TORII_FUDA_ISSUER` | deployment operator | Fuda / Torii | Must match exactly |
| `SHAIDEN_BEARER` / `FUDA_STATIC_SUBJECT_TOKEN` | deployment operator | Shaiden / Fuda | Same local or Compose subject secret |
| `TORII_GATEWAY_BASE_URL` | deployment operator | Torii | Browser-visible BFF origin for backend OAuth callbacks |
| `*_DATABASE_URL` | deployment operator | each corresponding service | Required Postgres connection |
| `KEIDAI_PARTITION_RETENTION_DAYS` | deployment operator | Torii, Shaiden | Retention period for partitioned data |

Native development commonly uses an issuer such as `https://fuda.local` with a
locally reachable JWKS URL. Compose uses internal service URLs. The issuer
claim and Torii's expected issuer must always match; do not copy an issuer
value between environments without updating both services.

## Demo prerequisites

The stack starts with an empty Fuda agent registry. Before submitting a task:

1. Sign in as an allowlisted operator.
2. Create an agent in keidai-ui.
3. Assign its groups according to the Torii policy you intend to test.
4. Link a backend OAuth account if a `user_oauth` server requires one.

Replica/approval smoke tests also require an agent and group policy whose
gated tool matches the test. The current Kubernetes example uses
`shaiden-newsletter-01` with `gmail.create_draft`; create that agent and link
the required OAuth credential before running the test.
