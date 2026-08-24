# Operations

## Operator registry

`deploy/operators.example.yaml` is the source of truth for mapping a Google
operator identity to Keidai's opaque `owner_id`. Configure it before the first
login and mount the same file into Fuda, Torii, and keidai-ui.

At boot, Fuda reconciles its owners against this registry. When
`TORII_OPERATORS_PATH` is set, Torii removes OAuth rows for owners removed from
the registry. Restart Torii after changing the file so that reconciliation
runs.

## OAuth

There are two independent OAuth uses:

1. **Operator login** authenticates a human to keidai-ui. The local callback is
   `http://localhost:3000/auth/callback`.
2. **Backend credential linking** lets Torii obtain a user's credential for a
   `user_oauth` backend. The local callback is
   `http://localhost:3000/oauth/callback/{provider}`.

The BFF proxies backend callbacks to Torii. When the BFF is the public edge,
set `TORII_GATEWAY_BASE_URL` to the BFF origin, never to Torii's private
listen address. Provider-specific setup is documented in the
[Torii README](../apps/torii/README.md#oauth-linking-ui).

## Secrets and signing keys

Do not commit `.env` files, OAuth client secrets, subject tokens, service
tokens, or Fuda private signing keys.

- `BFF_SERVICE_TOKEN` authenticates keidai-ui to management APIs. Generate it
  with `openssl rand -hex 32` and set the same value for all participating
  services.
- Fuda signs agent JWTs with an RSA private key. Keep the file mode
  restrictive (`0600`) and follow Fuda's publish → sign → retire rotation
  procedure.
- For Compose, `SHAIDEN_BEARER` and `FUDA_STATIC_SUBJECT_TOKEN` represent the
  same shared subject secret. Kubernetes instead uses a projected
  service-account token.

See [Reference](reference.md) for the owning service and
[SECURITY.md](../SECURITY.md) for responsible reporting.

## Observability and retention

Torii writes structured call traces and Shaiden persists run history in
Postgres. Their weekly partitions are retained for seven days by default;
set `KEIDAI_PARTITION_RETENTION_DAYS` to adjust the period. Traces include
credential references only, never token values.
