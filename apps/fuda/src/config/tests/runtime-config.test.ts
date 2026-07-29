import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { writeTempSigningKeyPem } from "../../signing/tests/test-helpers.js";
import {
  ConfigValidationError,
  loadRuntimeConfig,
} from "../runtime-config.js";

function envWithTempDbAndKey(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const dbPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fuda-config-")),
    "fuda.db",
  );
  const keyPath = writeTempSigningKeyPem("default");
  return {
    FUDA_DB_PATH: dbPath,
    FUDA_SIGNING_KEYS: `default=${keyPath}`,
    FUDA_SIGNING_KID: "default",
    ...overrides,
  };
}

describe("loadRuntimeConfig", () => {
  it("defaults to localhost, port 3300, and all route groups", () => {
    const config = loadRuntimeConfig(envWithTempDbAndKey());
    assert.equal(config.httpHost, "127.0.0.1");
    assert.equal(config.httpPort, 3300);
    assert.deepEqual(config.listenGroups, ["public", "agent", "management"]);
    assert.equal(config.signingKeys.signingKid, "default");
    assert.equal(config.signingKeys.keys.length, 1);
  });

  it("parses a subset of listen groups for network separation", () => {
    const config = loadRuntimeConfig(
      envWithTempDbAndKey({ FUDA_LISTEN_GROUPS: "public" }),
    );
    assert.deepEqual(config.listenGroups, ["public"]);
  });

  it("parses two signing keys for rotation", () => {
    const oldPath = writeTempSigningKeyPem("old");
    const newPath = writeTempSigningKeyPem("new");
    const config = loadRuntimeConfig(
      envWithTempDbAndKey({
        FUDA_SIGNING_KEYS: `old=${oldPath},new=${newPath}`,
        FUDA_SIGNING_KID: "new",
      }),
    );
    assert.equal(config.signingKeys.signingKid, "new");
    assert.deepEqual(
      config.signingKeys.keys.map((key) => key.kid),
      ["old", "new"],
    );
  });

  it("parses env-sourced signing key material", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    const config = loadRuntimeConfig(
      envWithTempDbAndKey({
        FUDA_SIGNING_KEYS: "env-key=env:FUDA_TEST_SIGNING_PEM",
        FUDA_SIGNING_KID: "env-key",
        FUDA_TEST_SIGNING_PEM: pem,
      }),
    );
    assert.equal(config.signingKeys.keys[0]?.material.kind, "env");
  });

  it("fails fast on missing signing keys", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({
            FUDA_SIGNING_KEYS: "",
            FUDA_SIGNING_KID: "default",
          }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_SIGNING_KEYS/);
        return true;
      },
    );
  });

  it("fails fast when signing kid is not in the key list", () => {
    assert.throws(
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({ FUDA_SIGNING_KID: "missing" }),
        ),
      (error: unknown) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.errors.join("\n"), /FUDA_SIGNING_KID/);
        return true;
      },
    );
  });

  it("fails fast on invalid port", () => {
    assert.throws(
      () => loadRuntimeConfig(envWithTempDbAndKey({ FUDA_PORT: "nope" })),
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
          envWithTempDbAndKey({ FUDA_LISTEN_GROUPS: "public,jwks" }),
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
      () =>
        loadRuntimeConfig(
          envWithTempDbAndKey({ FUDA_LISTEN_GROUPS: " , " }),
        ),
      ConfigValidationError,
    );
  });
});
