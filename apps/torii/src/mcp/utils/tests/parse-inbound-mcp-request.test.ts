import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeMcpHeaderValue,
  parseInboundMcpRequest,
  resolveInboundMcpRequest,
} from "../parse-inbound-mcp-request.js";

describe("parseInboundMcpRequest", () => {
  it("extracts id, method, and tools/call name from the body", () => {
    assert.deepEqual(
      parseInboundMcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "github.search_issues" },
      }),
      { id: 1, method: "tools/call", name: "github.search_issues" },
    );
  });

  it("extracts resources/read uri as name", () => {
    assert.deepEqual(
      parseInboundMcpRequest({
        id: "r1",
        method: "resources/read",
        params: { uri: "file:///tmp/a" },
      }),
      { id: "r1", method: "resources/read", name: "file:///tmp/a" },
    );
  });

  it("extracts tasks/get taskId as name", () => {
    assert.deepEqual(
      parseInboundMcpRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tasks/get",
        params: { taskId: "abc123" },
      }),
      { id: 4, method: "tasks/get", name: "abc123" },
    );
  });
});

describe("resolveInboundMcpRequest", () => {
  const toolsCallBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "github.echo" },
  };

  it("uses headers as the routing source of truth when they match the body", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "tools/call", "mcp-name": "github.echo" },
      toolsCallBody,
    );
    assert.deepEqual(resolved, {
      ok: true,
      context: { id: 1, method: "tools/call", name: "github.echo" },
    });
  });

  it("rejects a missing Mcp-Method header", () => {
    const resolved = resolveInboundMcpRequest({}, toolsCallBody);
    assert.equal(resolved.ok, false);
    if (resolved.ok) {
      return;
    }
    assert.equal(resolved.context.id, 1);
    assert.match(resolved.message, /Mcp-Method header is missing/);
  });

  it("rejects a missing Mcp-Name on tools/call", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "tools/call" },
      toolsCallBody,
    );
    assert.equal(resolved.ok, false);
    if (resolved.ok) {
      return;
    }
    assert.match(resolved.message, /Mcp-Name header is missing/);
  });

  it("rejects a missing Mcp-Name on tasks/get", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "tasks/get" },
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tasks/get",
        params: { taskId: "abc123" },
      },
    );
    assert.equal(resolved.ok, false);
    if (resolved.ok) {
      return;
    }
    assert.match(resolved.message, /Mcp-Name header is missing/);
  });

  it("rejects an Mcp-Method that disagrees with the body", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "tools/list" },
      toolsCallBody,
    );
    assert.equal(resolved.ok, false);
    if (resolved.ok) {
      return;
    }
    assert.match(resolved.message, /tools\/list.*tools\/call/);
  });

  it("rejects an Mcp-Name that disagrees with the body", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "tools/call", "mcp-name": "other.tool" },
      toolsCallBody,
    );
    assert.equal(resolved.ok, false);
    if (resolved.ok) {
      return;
    }
    assert.match(resolved.message, /other\.tool.*github\.echo/);
  });

  it("trims header whitespace before comparing", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": " tools/call ", "mcp-name": " github.echo " },
      toolsCallBody,
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) {
      return;
    }
    assert.equal(resolved.context.name, "github.echo");
  });

  it("does not require Mcp-Name for subscriptions/listen", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "subscriptions/listen" },
      {
        jsonrpc: "2.0",
        id: 7,
        method: "subscriptions/listen",
        params: { notifications: { taskIds: ["abc"] } },
      },
    );
    assert.deepEqual(resolved, {
      ok: true,
      context: { id: 7, method: "subscriptions/listen", name: undefined },
    });
  });

  it("does not require Mcp-Name for tools/list", () => {
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "tools/list" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
    );
    assert.deepEqual(resolved, {
      ok: true,
      context: { id: 2, method: "tools/list", name: undefined },
    });
  });

  it("decodes a Base64-sentinel Mcp-Name before comparing", () => {
    const name = "tool with space";
    const encoded = `=?base64?${Buffer.from(name, "utf8").toString("base64")}?=`;
    const resolved = resolveInboundMcpRequest(
      { "mcp-method": "tools/call", "mcp-name": encoded },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name },
      },
    );
    assert.equal(resolved.ok, true);
    if (!resolved.ok) {
      return;
    }
    assert.equal(resolved.context.name, name);
  });
});

describe("decodeMcpHeaderValue", () => {
  it("returns plain ASCII values unchanged", () => {
    assert.equal(decodeMcpHeaderValue("get_weather"), "get_weather");
  });
});
