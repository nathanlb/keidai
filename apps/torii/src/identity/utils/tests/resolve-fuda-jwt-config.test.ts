import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveFudaJwtConfig } from "../resolve-fuda-jwt-config.js";

describe("resolveFudaJwtConfig", () => {
  it("resolves issuer and jwks uri together", () => {
    assert.deepEqual(
      resolveFudaJwtConfig({
        TORII_FUDA_ISSUER: "https://fuda.test",
        TORII_FUDA_JWKS_URI: "https://fuda.test/.well-known/jwks.json",
      }),
      {
        issuer: "https://fuda.test",
        jwksUri: "https://fuda.test/.well-known/jwks.json",
      },
    );
  });

  it("rejects missing config", () => {
    assert.throws(
      () => resolveFudaJwtConfig({}),
      /Missing Fuda JWT configuration/,
    );
  });

  it("rejects partial config", () => {
    assert.throws(
      () =>
        resolveFudaJwtConfig({
          TORII_FUDA_ISSUER: "https://fuda.test",
        }),
      /partially configured/,
    );
  });
});
