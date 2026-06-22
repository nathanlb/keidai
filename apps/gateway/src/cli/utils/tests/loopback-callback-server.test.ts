import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { describe, it } from "node:test";
import { startLoopbackCallbackServer } from "../loopback-callback-server.js";

async function fetchHttpsCallback(url: string): Promise<number> {
  return await new Promise((resolve, reject) => {
    const req = httpsRequest(url, { rejectUnauthorized: false }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

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

  it("serves HTTPS callbacks when the redirect URI uses https", async () => {
    const redirectUri = "https://127.0.0.1:8766/callback";
    const server = await startLoopbackCallbackServer(redirectUri, 5_000);

    const callbackPromise = server.waitForCallback();
    const status = await fetchHttpsCallback(
      "https://127.0.0.1:8766/callback?code=auth-code-456&state=state-def",
    );

    assert.equal(status, 200);
    assert.deepEqual(await callbackPromise, {
      code: "auth-code-456",
      state: "state-def",
    });
    await server.close();
  });
});
