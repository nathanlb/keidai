import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { startLoopbackCallbackServer } from "../loopback-callback-server.js";

describe("startLoopbackCallbackServer", () => {
  it("resolves with code and state on the callback path", async () => {
    const redirectUri = "http://127.0.0.1:8765/callback";
    const server = await startLoopbackCallbackServer(redirectUri, 5_000);

    const callbackPromise = server.waitForCallback();
    const response = await fetch(
      "http://127.0.0.1:8765/callback?code=auth-code-123&state=state-abc",
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await callbackPromise, {
      code: "auth-code-123",
      state: "state-abc",
    });
    await server.close();
  });
});
