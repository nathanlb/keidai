# Operations

## Operator registry

Human login is OpenID Connect at the keidai-ui BFF. Set `OIDC_ISSUER_URL`,
`OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, and `OIDC_REDIRECT_URI` for any
standard provider (Google Workspace, Okta, Entra ID, Keycloak). When
`OIDC_ISSUER_URL` is unset, the BFF keeps the Google defaults and the
`KEIDAI_GOOGLE_*` client settings.

The first successful login creates an owner row in Fuda. Later logins for the
same IdP subject keep that `owner_id` and refresh email and display name.
`OIDC_ALLOWED_EMAIL_DOMAINS` optionally restricts email domains. For Google,
that list also requires the `hd` claim.

`deploy/operators.example.yaml` is optional. When `KEIDAI_OPERATORS_PATH` is
set, the file is an allowlist: only those Google identities can sign in, and
their `owner_id` is reused. Fuda and Torii still read the file at boot, but
the default reconcile is additive — listed owners are upserted, and owners
created at login are left in place, including their OAuth grants. Set
`FUDA_OPERATORS_RECONCILE=strict` or `TORII_OPERATORS_RECONCILE=strict` to
restore the old boot-time delete.

Disable or delete an owner through Fuda (`PATCH` or `DELETE /api/owners/:ownerId`).
Delete cascades that owner's agents. When `FUDA_TORII_URL` is set, Fuda also
asks Torii to wipe that owner's OAuth grants before the row is removed.

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
