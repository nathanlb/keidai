import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLATFORM_BEARER_ID } from "../../bearers/platform-bearer.js";
import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import { StaticSubjectValidator } from "../validators/static-subject-validator.js";

describe("StaticSubjectValidator", () => {
  const validator = new StaticSubjectValidator({
    tokens: new Set(["dev-secret", "ci-secret"]),
  });

  it("maps a configured credential to the platform bearer_id", async () => {
    assert.equal(await validator.validate("dev-secret"), PLATFORM_BEARER_ID);
    assert.equal(await validator.validate("ci-secret"), PLATFORM_BEARER_ID);
  });

  it("trims surrounding whitespace on the subject token", async () => {
    assert.equal(await validator.validate("  dev-secret  "), PLATFORM_BEARER_ID);
  });

  it("rejects unknown credentials without echoing the subject", async () => {
    await assert.rejects(
      () => validator.validate("not-a-real-secret"),
      (error: unknown) => {
        assert.ok(error instanceof SubjectTokenValidationError);
        assert.equal(error.message, "Invalid subject token");
        assert.doesNotMatch(error.message, /not-a-real-secret/);
        return true;
      },
    );
  });

  it("rejects empty subject tokens", async () => {
    await assert.rejects(
      () => validator.validate("   "),
      SubjectTokenValidationError,
    );
  });
});
