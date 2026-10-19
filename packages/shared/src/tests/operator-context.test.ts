import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATOR_OWNER_HEADER,
  OPERATOR_ROLE_HEADER,
  operatorContextHeaders,
  readOperatorContext,
  stripOperatorContextHeaders,
} from "../operator-context.js";

describe("readOperatorContext", () => {
  it("returns owner and role when both trusted headers are present", () => {
    assert.deepEqual(
      readOperatorContext({
        [OPERATOR_OWNER_HEADER]: "ada",
        [OPERATOR_ROLE_HEADER]: "admin",
      }),
      { ownerId: "ada", role: "admin" },
    );
  });

  it("returns null when the role is missing or unknown", () => {
    assert.equal(readOperatorContext({ [OPERATOR_OWNER_HEADER]: "ada" }), null);
    assert.equal(
      readOperatorContext({
        [OPERATOR_OWNER_HEADER]: "ada",
        [OPERATOR_ROLE_HEADER]: "owner",
      }),
      null,
    );
  });
});

describe("stripOperatorContextHeaders", () => {
  it("removes every x-keidai-operator-* header", () => {
    assert.deepEqual(
      stripOperatorContextHeaders({
        accept: "application/json",
        [OPERATOR_OWNER_HEADER]: "spoofed",
        [OPERATOR_ROLE_HEADER]: "admin",
        "x-keidai-operator-extra": "nope",
      }),
      { accept: "application/json" },
    );
  });
});

describe("operatorContextHeaders", () => {
  it("sets the trusted owner and role headers", () => {
    assert.deepEqual(
      operatorContextHeaders({ ownerId: "ada", role: "member" }),
      {
        [OPERATOR_OWNER_HEADER]: "ada",
        [OPERATOR_ROLE_HEADER]: "member",
      },
    );
  });
});
