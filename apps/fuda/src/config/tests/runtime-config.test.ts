import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  ConfigValidationError,
  loadRuntimeConfig,
} from "../runtime-config.js";

function envWithTempDb(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const dbPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-config-")),
    "fuda.db",
  );
  return {
    FUDA_DB_PATH: dbPath,
    ...overrides,
  };
}

describe("loadRuntimeConfig", () => {
  it("defaults to localhost, port 3300, and all route groups", () => {
    const config = loadRuntimeConfig(envWithTempDb());
    assert.equal(config.httpHost, "127.0.0.1");
    assert.equal(config.httpPort, 3300);
    assert.deepEqual(config.listenGroups, ["public", "agent", "management"]);
  });

  it("parses a subset of listen groups for network separation", () => {
    const config = loadRuntimeConfig(
      envWithTempDb({ FUDA_LISTEN_GROUPS: "public" }),
    );
    assert.deepEqual(config.listenGroups, ["public"]);
  });

  it("fails fast on invalid port", () => {
    assert.throws(
      () => loadRuntimeConfig(envWithTempDb({ FUDA_PORT: "nope" })),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_PORT/);
        return true;
      },
    );
  });

  it("fails fast on unknown listen group", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDb({ FUDA_LISTEN_GROUPS: "public,jwks" }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /jwks/);
        return true;
      },
    );
  });

  it("fails fast on empty listen groups", () => {
    assert.throws(
      () => loadRuntimeConfig(envWithTempDb({ FUDA_LISTEN_GROUPS: " , " })),
      ConfigValidationError,
    );
  });
});
