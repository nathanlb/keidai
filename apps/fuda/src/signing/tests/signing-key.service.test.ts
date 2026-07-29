import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeProtectedHeader } from "jose";
import { SigningKeyService } from "../signing-key.service.js";
import { writeTempSigningKeyPem } from "./test-helpers.js";

describe("SigningKeyService", () => {
  it("publishes all loaded public keys and signs with the configured kid", async () => {
    const oldPath = writeTempSigningKeyPem("old");
    const newPath = writeTempSigningKeyPem("new");
    const service = new SigningKeyService({
      keys: [
        { kid: "old", material: { kind: "file", path: oldPath } },
        { kid: "new", material: { kind: "file", path: newPath } },
      ],
      signingKid: "new",
    });

    assert.equal(service.getSigningKid(), "new");
    assert.deepEqual(
      service.getJwks().keys.map((key) => key.kid).sort(),
      ["new", "old"],
    );

    const token = await service.signJwt({
      issuer: "https://fuda.test",
      audience: "torii",
      expiresInSeconds: 60,
      claims: { agent_id: "a1" },
    });
    assert.equal(decodeProtectedHeader(token).kid, "new");
    assert.equal(decodeProtectedHeader(token).alg, "RS256");
  });

  it("loads PEM from an environment variable", async () => {
    const path = writeTempSigningKeyPem("file-key");
    const { readFileSync } = await import("node:fs");
    const pem = readFileSync(path, "utf8");
    const service = new SigningKeyService(
      {
        keys: [
          { kid: "env-key", material: { kind: "env", name: "FUDA_PEM" } },
        ],
        signingKid: "env-key",
      },
      { FUDA_PEM: pem },
    );
    assert.equal(service.getJwks().keys[0]?.kid, "env-key");
  });

  it("fails when the private key file is missing", () => {
    assert.throws(
      () =>
        new SigningKeyService({
          keys: [
            {
              kid: "missing",
              material: { kind: "file", path: "/no/such/key.pem" },
            },
          ],
          signingKid: "missing",
        }),
      /Failed to read signing key file/,
    );
  });
});
