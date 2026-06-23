import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createServer } from "../create-server.js";

describe("createServer", () => {
  let app: Awaited<ReturnType<typeof createServer>>;

  before(async () => {
    app = await createServer({ mode: "production" });
    await app.listen({ port: 0, host: "127.0.0.1" });
  });

  after(async () => {
    await app.close();
  });

  it("serves the SPA shell for unknown client routes", async () => {
    const address = app.server.address();
    assert(address && typeof address === "object");

    const response = await fetch(`http://127.0.0.1:${address.port}/torii/connections`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  });
});
