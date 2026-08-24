# @keidai/shared

Shared TypeScript contracts and utilities for Keidai services. This package
owns cross-service types, schemas, structured logging, Torii configuration
types, catalog types, and environment loading helpers.

Keep domain behavior in the owning application. Add code here only when it is a
stable contract or utility genuinely shared by more than one package.

Consumers use workspace imports:

```ts
import { /* shared export */ } from "@keidai/shared";
```

The exported API is defined by [`src/index.ts`](src/index.ts). Run the relevant
consumer tests after changing a shared contract.
