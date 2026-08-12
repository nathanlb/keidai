import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_CACHE_TTL_MS } from "@modelcontextprotocol/client";
import {
  listToolsCacheIsStale,
  listToolsExpiresAtMs,
  readListToolsCacheHint,
} from "../list-tools-cache.js";

describe("listTools cache hints (SEP-2549)", () => {
  it("reads ttlMs and private cacheScope from a list result", () => {
    assert.deepEqual(
      readListToolsCacheHint({
        tools: [],
        ttlMs: 30_000,
        cacheScope: "private",
      }),
      { ttlMs: 30_000, cacheScope: "private" },
    );
  });

  it("ignores missing or invalid ttlMs (legacy servers)", () => {
    assert.equal(readListToolsCacheHint({ tools: [] }), undefined);
    assert.equal(readListToolsCacheHint({ tools: [], ttlMs: -1 }), undefined);
    assert.equal(readListToolsCacheHint(null), undefined);
  });

  it("caps expiry using MAX_CACHE_TTL_MS", () => {
    const now = 1_000_000;
    assert.equal(
      listToolsExpiresAtMs({ ttlMs: MAX_CACHE_TTL_MS + 60_000 }, now),
      now + MAX_CACHE_TTL_MS,
    );
    assert.equal(listToolsExpiresAtMs({ ttlMs: 0 }, now), now);
    assert.equal(listToolsExpiresAtMs(undefined, now), undefined);
  });

  it("treats an elapsed expiry as stale and an absent hint as fresh for the run", () => {
    assert.equal(listToolsCacheIsStale(undefined, 50), false);
    assert.equal(listToolsCacheIsStale(100, 50), false);
    assert.equal(listToolsCacheIsStale(100, 100), true);
    assert.equal(listToolsCacheIsStale(100, 101), true);
  });
});
