# Keidai documentation

Keidai is a self-hostable agent ecosystem. The public edge is the **keidai-ui**
operator application; its backend services remain private to the deployment.

Start here:

- [Getting started](getting-started.md) — choose Docker Compose, native local
  development, or Kubernetes.
- [Architecture](architecture.md) — component boundaries and trust model.
- [Operations](operations.md) — operator registry, OAuth, secrets, and
  observability.
- [Reference](reference.md) — ports, public URLs, environment ownership, and
  the demo setup.
- [Testing](testing.md) — keidai-ui's layered test strategy.

Service-specific setup and API details live with their source:

- [Torii](../apps/torii/README.md)
- [Fuda](../apps/fuda/README.md)
- [Shaiden](../apps/shaiden/README.md)
- [keidai-ui](../apps/keidai-ui/README.md)
- [Kubernetes deployment](../deploy/k8s/README.md)
