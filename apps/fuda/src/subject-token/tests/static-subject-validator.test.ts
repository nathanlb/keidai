import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SubjectTokenValidationError } from "../types/subject-token-validation-error.js";
import { StaticSubjectValidator } from "../validators/static-subject-validator.js";

describe("StaticSubjectValidator", () => {
  const validator = new StaticSubjectValidator({
    mappings: new Map([
      ["dev-secret", "local-dev"],
      ["ci-secret", "ci-runner"],
    ]),
  });

  it("maps a configured credential to bearer_id", async () => {
    assert.equal(await validator.validate("dev-secret"), "local-dev");
    assert.equal(await validator.validate("ci-secret"), "ci-runner");
  });

  it("trims surrounding whitespace on the subject token", async () => {
    assert.equal(await validator.validate("  dev-secret  "), "local-dev");
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
