# @keidai/postgres

Shared Postgres infrastructure for Keidai services: connection pools,
transactions, migrations, test-schema helpers, and partition management.

Application-owned migrations and data access remain in the owning service.
Use this package for database lifecycle concerns that must behave consistently
across Fuda, Torii, and Shaiden.

The exported API is defined by [`src/index.ts`](src/index.ts). Changes here
should be verified against every consuming service and its database tests.
