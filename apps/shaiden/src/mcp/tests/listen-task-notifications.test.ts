import assert from "node:assert/strict";
import { createServer, type ServerResponse } from "node:http";
import { describe, it } from "node:test";
import {
  MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
  MCP_TASKS_NOTIFICATION_METHOD,
} from "@keidai/shared";
import { listenForTaskNotifications } from "../listen-task-notifications.js";

async function startListenStub(handler: {
  onListen: (res: ServerResponse) => void;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        method?: string;
      };
      if (body.method !== "subscriptions/listen") {
        res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32601, message: "Method not found" },
          }),
        );
        return;
      }
      handler.onListen(res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected TCP address");
  }
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

function writeSse(res: ServerResponse, payload: unknown): void {
  res.write(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
}

describe("listenForTaskNotifications", () => {
  it("wakes on notifications/tasks for the subscribed task", async () => {
    const stub = await startListenStub({
      onListen: (res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        writeSse(res, {
          jsonrpc: "2.0",
          method: MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD,
          params: { notifications: { taskIds: ["task-1"] } },
        });
        writeSse(res, {
          jsonrpc: "2.0",
          method: MCP_TASKS_NOTIFICATION_METHOD,
          params: { taskId: "task-1", status: "completed" },
        });
      },
    });
    const abort = new AbortController();
    try {
      const woken = await new Promise<boolean>((resolve) => {
        void listenForTaskNotifications({
          mcpUrl: stub.url,
          authorization: "Bearer t",
          taskId: "task-1",
          onWake: () => resolve(true),
          signal: abort.signal,
        }).then(() => resolve(false));
      });
      assert.equal(woken, true);
    } finally {
      abort.abort();
      await stub.close();
    }
  });

  it("does not throw when the listen stream is killed", async () => {
    const stub = await startListenStub({
      onListen: (res) => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end();
      },
    });
    const abort = new AbortController();
    try {
      await listenForTaskNotifications({
        mcpUrl: stub.url,
        authorization: "Bearer t",
        taskId: "task-1",
        onWake: () => {
          throw new Error("should not wake");
        },
        signal: abort.signal,
      });
    } finally {
      abort.abort();
      await stub.close();
    }
  });
});
