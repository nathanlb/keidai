# Security policy

## Supported versions

Security fixes are made on the current default branch. This repository is
actively evolving and does not currently publish separate supported release
lines.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include secrets,
tokens, private keys, or customer data in a report.

Use GitHub's private vulnerability-reporting feature for this repository when
available. If it is unavailable, contact the repository maintainers through
the private contact method listed in the repository profile and include:

- a concise description and affected component;
- reproduction steps or a proof of concept;
- impact and any suggested mitigation; and
- a secure way to contact you for follow-up.

We will acknowledge reports, investigate them, and coordinate disclosure with
the reporter where practical.

## Secret handling

Keidai deployments use OAuth client secrets, `BFF_SERVICE_TOKEN`, local
subject tokens, Postgres URLs, and Fuda signing keys. Keep these in deployment
secret stores or untracked environment files. Rotate any value that may have
been exposed and remove it from Git history before sharing a remediation.
