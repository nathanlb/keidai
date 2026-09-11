import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOutboundMcpParamHeaders,
  encodeMcpParamValue,
} from "../mcp-param-headers.js";

const GITHUB_FILE_SCHEMA = {
  type: "object",
  properties: {
    owner: { type: "string", "x-mcp-header": "owner" },
    repo: { type: "string", "x-mcp-header": "repo" },
    path: { type: "string" },
  },
  required: ["owner", "repo", "path"],
};

describe("buildOutboundMcpParamHeaders", () => {
  it("mirrors GitHub owner/repo annotations and skips unannotated args", () => {
    assert.deepEqual(
      buildOutboundMcpParamHeaders(GITHUB_FILE_SCHEMA, {
        owner: "octo",
        repo: "hello",
        path: "README.md",
      }),
      {
        "mcp-param-owner": "octo",
        "mcp-param-repo": "hello",
      },
    );
  });

  it("omits a header when the annotated argument is null or absent", () => {
    assert.deepEqual(
      buildOutboundMcpParamHeaders(GITHUB_FILE_SCHEMA, {
        owner: "octo",
        repo: null,
      }),
      { "mcp-param-owner": "octo" },
    );
    assert.deepEqual(buildOutboundMcpParamHeaders(GITHUB_FILE_SCHEMA, {}), {});
  });

  it("encodes values that are not safe plain ASCII header fields", () => {
    assert.equal(
      encodeMcpParamValue("hello"),
      "hello",
    );
    assert.equal(
      encodeMcpParamValue("レポート"),
      `=?base64?${Buffer.from("レポート", "utf8").toString("base64")}?=`,
    );
    assert.deepEqual(
      buildOutboundMcpParamHeaders(GITHUB_FILE_SCHEMA, {
        owner: "octo",
        repo: "レポート",
      }),
      {
        "mcp-param-owner": "octo",
        "mcp-param-repo": encodeMcpParamValue("レポート"),
      },
    );
  });

  it("walks nested properties and stringifies booleans and integers", () => {
    const schema = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            dryRun: { type: "boolean", "x-mcp-header": "dry-run" },
            limit: { type: "integer", "x-mcp-header": "limit" },
          },
        },
      },
    };
    assert.deepEqual(
      buildOutboundMcpParamHeaders(schema, {
        nested: { dryRun: true, limit: 42 },
      }),
      {
        "mcp-param-dry-run": "true",
        "mcp-param-limit": "42",
      },
    );
  });
});
