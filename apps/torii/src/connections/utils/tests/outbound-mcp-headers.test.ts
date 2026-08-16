import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ensureOutboundMcpRoutingHeaders } from "../outbound-mcp-headers.js";

describe("ensureOutboundMcpRoutingHeaders", () => {
  it("sets Mcp-Method from a tools/list JSON body", () => {
    const headers = new Headers();
    ensureOutboundMcpRoutingHeaders(
      headers,
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    );
    assert.equal(headers.get("mcp-method"), "tools/list");
    assert.equal(headers.get("mcp-name"), null);
  });

  it("sets Mcp-Method and Mcp-Name from a tools/call JSON body", () => {
    const headers = new Headers();
    ensureOutboundMcpRoutingHeaders(
      headers,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "search_issues" },
      }),
    );
    assert.equal(headers.get("mcp-method"), "tools/call");
    assert.equal(headers.get("mcp-name"), "search_issues");
  });

  it("sets Mcp-Name from a tasks/get JSON body", () => {
    const headers = new Headers();
    ensureOutboundMcpRoutingHeaders(
      headers,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tasks/get",
        params: { taskId: "abc" },
      }),
    );
    assert.equal(headers.get("mcp-method"), "tasks/get");
    assert.equal(headers.get("mcp-name"), "abc");
  });

  it("does not overwrite headers the SDK already set", () => {
    const headers = new Headers({ "mcp-method": "tools/list" });
    ensureOutboundMcpRoutingHeaders(
      headers,
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "echo" },
      }),
    );
    assert.equal(headers.get("mcp-method"), "tools/list");
    assert.equal(headers.get("mcp-name"), null);
  });
});
