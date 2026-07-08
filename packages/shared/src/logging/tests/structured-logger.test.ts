import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StructuredLogger } from "../structured-logger.js";

describe("StructuredLogger", () => {
  it("emits valid JSON on stderr with required fields", () => {
    const lines: string[] = [];
    const originalWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;

    try {
      const logger = new StructuredLogger();
      logger.info("boot.config_loaded", { serverCount: 2 });
      logger.error("connection.failed", {
        server: "github",
        url: "http://localhost:0",
        error: "credential resolution failed",
      });

      assert.equal(lines.length, 2);

      const info = JSON.parse(lines[0]!) as Record<string, unknown>;
      assert.equal(info.recordType, "log");
      assert.equal(typeof info.timestamp, "string");
      assert.doesNotThrow(() => new Date(String(info.timestamp)).toISOString());
      assert.equal(info.level, "info");
      assert.equal(info.event, "boot.config_loaded");
      assert.equal(info.serverCount, 2);

      const error = JSON.parse(lines[1]!) as Record<string, unknown>;
      assert.equal(error.level, "error");
      assert.equal(error.event, "connection.failed");
      assert.equal(error.server, "github");

      for (const line of lines) {
        assert.doesNotMatch(line, /Bearer/);
        assert.doesNotMatch(line, /gho_/);
      }
    } finally {
      process.stderr.write = originalWrite;
    }
  });
});
