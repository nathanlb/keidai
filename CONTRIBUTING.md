# Contributing to Keidai

Thanks for contributing. Keidai is a pnpm/Turborepo monorepo; service
boundaries are intentional, so keep changes scoped to the component that owns
the behavior.

## Development workflow

1. Use Node.js 24 and install dependencies with `pnpm install`.
2. Read the relevant service README and [public documentation](docs/README.md).
3. Make focused changes with tests colocated beside the code they cover.
4. Run the smallest relevant check first, then the repository checks required
   by the change:

   ```bash
   pnpm test
   pnpm build
   ```

The keidai-ui test strategy is documented in [docs/testing.md](docs/testing.md).
Shaiden's live model evals are separate from `pnpm test`; see
[apps/shaiden/eval/README.md](apps/shaiden/eval/README.md).

## Pull requests

- Explain the user or operator outcome, not only the implementation.
- Include tests for changed behavior, or explain why tests are not applicable.
- Update public documentation when configuration, API behavior, or an operator
  workflow changes.
- Do not commit `.env` files, private keys, bearer tokens, OAuth secrets, or
  production identifiers.
- Keep volatile configuration documented in
  [docs/reference.md](docs/reference.md) rather than duplicating it across
  service READMEs.

The pull request template contains the review checklist used by this project.

## Reporting problems

Use the issue tracker for reproducible bugs and feature requests. For a
security-sensitive report, follow [SECURITY.md](SECURITY.md) instead of opening
a public issue.
