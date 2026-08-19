import { loadEnvForPackage } from "@keidai/shared/load-env";

loadEnvForPackage(import.meta.url);

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addWeeks,
  createIsolatedSchema,
  defaultPartitionRetentionMs,
  dropWeeklyPartitionsOlderThan,
  ensureWeeklyPartitions,
  partitionName,
  utcWeekStart,
} from "../index.js";

describe("weekly partitions", () => {
  it("honors KEIDAI_PARTITION_RETENTION_DAYS", () => {
    assert.equal(defaultPartitionRetentionMs({}), 7 * 24 * 60 * 60 * 1000);
    assert.equal(
      defaultPartitionRetentionMs({ KEIDAI_PARTITION_RETENTION_DAYS: "14" }),
      14 * 24 * 60 * 60 * 1000,
    );
    assert.throws(
      () => defaultPartitionRetentionMs({ KEIDAI_PARTITION_RETENTION_DAYS: "0" }),
      /positive number/,
    );
  });

  it("creates current and next-week partitions and drops expired ones", async () => {
    const isolated = await createIsolatedSchema();
    try {
      await isolated.pool.query(`
        CREATE TABLE events (
          id TEXT NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (timestamp, id)
        ) PARTITION BY RANGE (timestamp)
      `);

      const around = new Date("2026-08-19T12:00:00.000Z");
      await ensureWeeklyPartitions(isolated.pool, "events", around, 1);

      const current = utcWeekStart(around);
      const next = addWeeks(current, 1);
      const currentName = partitionName("events", current);
      const nextName = partitionName("events", next);

      const tables = await isolated.pool.query<{ relname: string }>(
        `SELECT c.relname
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = current_schema()
           AND c.relkind = 'r'
           AND c.relispartition
         ORDER BY c.relname`,
      );
      assert.deepEqual(
        tables.rows.map((row) => row.relname),
        [currentName, nextName],
      );

      const dropped = await dropWeeklyPartitionsOlderThan(
        isolated.pool,
        "events",
        addWeeks(around, 3),
      );
      assert.ok(dropped.includes(currentName));
      assert.ok(dropped.includes(nextName));
    } finally {
      await isolated.close();
    }
  });
});
