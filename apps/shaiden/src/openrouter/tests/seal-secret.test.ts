import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hintForSecret,
  sealSecretValue,
  unsealSecretValue,
} from "../seal-secret.js";

describe("sealSecretValue", () => {
  it("round-trips a key without storing the plaintext", () => {
    const key = "shaiden-test-secret-key";
    const apiKey = "sk-or-v1-super-secret-value";
    const sealed = sealSecretValue(apiKey, key);
    assert.equal(sealed.includes(apiKey), false);
    assert.equal(unsealSecretValue(sealed, key), apiKey);
    assert.equal(hintForSecret(apiKey), "…alue");
  });

  it("rejects a ciphertext sealed with a different key", () => {
    const sealed = sealSecretValue(
      "sk-or-v1-super-secret-value",
      "key-one-long-enough",
    );
    assert.throws(
      () => unsealSecretValue(sealed, "key-two-long-enough"),
      /decrypt/,
    );
  });
});
