import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import {
  createIsolatedSchema,
  notifyChannel,
  PgChannelListener,
  resolveTestDatabaseUrl,
} from "../index.js";

async function waitUntil(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for LISTEN notification");
}

describe("PgChannelListener", () => {
  it("receives NOTIFY from another connection on the same database", async () => {
    const isolated = await createIsolatedSchema();
    const channel = `test_listen_${randomUUID().replaceAll("-", "")}`;
    let hits = 0;
    const listener = new PgChannelListener({
      connectionString: resolveTestDatabaseUrl(),
      channel,
      onNotification: () => {
        hits += 1;
      },
    });

    try {
      await listener.start();
      await notifyChannel(isolated.pool, channel);
      await waitUntil(() => hits >= 1);
      assert.equal(hits, 1);
    } finally {
      await listener.stop();
      await isolated.close();
    }
  });
});
