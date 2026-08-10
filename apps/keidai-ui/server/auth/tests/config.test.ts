import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  OperatorAuthConfigError,
  resolveOperatorAuthConfigFromEnv,
} from "../config.js";

describe("resolveOperatorAuthConfigFromEnv", () => {
  it("requires Google OIDC env and operators path", async () => {
    await assert.rejects(
      () => resolveOperatorAuthConfigFromEnv({}),
      (error: unknown) =>
        error instanceof OperatorAuthConfigError &&
        /KEIDAI_GOOGLE_CLIENT_ID/.test(error.message),
    );
  });

  it("builds config from a complete env + operators file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "keidai-ops-"));
    const operatorsPath = path.join(dir, "operators.yaml");
    await writeFile(
      operatorsPath,
      `operators:\n  - owner_id: demo-owner\n    google_email: Ops@Example.com\n`,
      "utf8",
    );

    const config = await resolveOperatorAuthConfigFromEnv({
      KEIDAI_GOOGLE_CLIENT_ID: "cid",
      KEIDAI_GOOGLE_CLIENT_SECRET: "csecret",
      KEIDAI_GOOGLE_REDIRECT_URI: "http://127.0.0.1:3000/auth/callback",
      KEIDAI_SESSION_SECRET: "x".repeat(32),
      KEIDAI_OPERATORS_PATH: operatorsPath,
      KEIDAI_COOKIE_SECURE: "false",
      NODE_ENV: "production",
    });

    assert.equal(config.googleClientId, "cid");
    assert.equal(config.cookieSecure, false);
    assert.equal(config.operators.length, 1);
    assert.equal(config.operators[0]?.owner_id, "demo-owner");
    assert.equal(config.operators[0]?.google_email, "ops@example.com");
  });
});
