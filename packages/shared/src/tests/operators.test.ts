import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OperatorsValidationError,
  isOperatorInRegistry,
  ownerIdsFromOperators,
  parseOperatorsDocument,
  resolveOwnerIdFromOperators,
} from "../operators.js";

describe("parseOperatorsDocument", () => {
  it("accepts a valid registry", () => {
    const file = parseOperatorsDocument({
      operators: [
        {
          owner_id: "demo-owner",
          google_sub: "sub-1",
          google_email: "Ops@Example.com",
        },
      ],
    });

    assert.equal(file.operators.length, 1);
    assert.equal(file.operators[0]?.google_email, "ops@example.com");
  });

  it("rejects duplicate owner_id", () => {
    assert.throws(
      () =>
        parseOperatorsDocument({
          operators: [
            { owner_id: "a", google_sub: "1" },
            { owner_id: "a", google_sub: "2" },
          ],
        }),
      (error: unknown) =>
        error instanceof OperatorsValidationError &&
        /duplicate owner_id/.test(error.message),
    );
  });

  it("requires google_sub or google_email", () => {
    assert.throws(
      () =>
        parseOperatorsDocument({
          operators: [{ owner_id: "a" }],
        }),
      OperatorsValidationError,
    );
  });
});

describe("resolveOwnerIdFromOperators", () => {
  const operators = parseOperatorsDocument({
    operators: [
      { owner_id: "owner-sub", google_sub: "sub-1" },
      { owner_id: "owner-email", google_email: "a@example.com" },
    ],
  }).operators;

  it("prefers google_sub", () => {
    assert.equal(
      resolveOwnerIdFromOperators(operators, {
        googleSub: "sub-1",
        email: "a@example.com",
      }),
      "owner-sub",
    );
  });

  it("falls back to email", () => {
    assert.equal(
      resolveOwnerIdFromOperators(operators, {
        googleSub: "other",
        email: "A@Example.com",
      }),
      "owner-email",
    );
  });

  it("returns null when unmatched", () => {
    assert.equal(
      resolveOwnerIdFromOperators(operators, {
        googleSub: "x",
        email: "y@example.com",
      }),
      null,
    );
    assert.equal(
      isOperatorInRegistry(operators, {
        googleSub: "x",
        email: "y@example.com",
      }),
      false,
    );
  });

  it("lists owner ids", () => {
    assert.deepEqual(ownerIdsFromOperators(operators), [
      "owner-sub",
      "owner-email",
    ]);
  });
});
