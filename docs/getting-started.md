# Getting started

Choose the path that matches the work you are doing. All paths require Node.js
24, pnpm, Docker, and a clone of this repository.

## Run the full stack with Docker Compose

This is the recommended first run. Compose publishes only keidai-ui at
`http://localhost:3000`; Fuda, Torii, and Shaiden are internal services.

1. Copy the example environment files described in [the reference](reference.md).
2. Generate the Fuda development signing key:

   ```bash
   mkdir -p apps/fuda/keys
   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
     -out apps/fuda/keys/dev.pem
   chmod 600 apps/fuda/keys/dev.pem
   ```

3. Configure an allowlisted operator in
   [`deploy/operators.example.yaml`](../deploy/operators.example.yaml). This
   maps the Google identity used to sign in to Keidai's opaque `owner_id`.
4. Start the stack:

   ```bash
   pnpm install
   docker compose up --build
   ```

5. Open `http://localhost:3000`, sign in, and create an agent.

See [Operations](operations.md) for Google OIDC and backend OAuth requirements.

## Develop services locally

Use this path when changing a service. Start Postgres, copy that service's
`.env.example` to `.env`, and then start the dependency chain:

```bash
pnpm install
docker compose up postgres -d
pnpm fuda:dev
pnpm --filter @keidai/torii dev
pnpm shaiden:dev
pnpm ui:dev
```

The commands run in separate terminals. `pnpm ui:dev` uses Vite at `:3000` and
an API-only BFF at `:3001`. The public URLs and environment ownership are
listed in [Reference](reference.md).

For service-specific required values, follow the relevant service README:
[Fuda](../apps/fuda/README.md), [Torii](../apps/torii/README.md),
[Shaiden](../apps/shaiden/README.md), and
[keidai-ui](../apps/keidai-ui/README.md).

## Run locally on Kubernetes

The Kubernetes manifests use projected service-account tokens between Shaiden
and Fuda and publish only the BFF. Copy `deploy/k8s/secrets.example.env` to
`deploy/k8s/secrets.env`, set the required values, then run:

```bash
pnpm k8s:up
```

The complete runbook, prerequisites, and teardown instructions are in
[deploy/k8s/README.md](../deploy/k8s/README.md).
