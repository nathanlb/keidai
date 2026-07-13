import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  oauthCallbackErrorHtml,
  oauthCallbackSuccessHtml,
} from "../oauth-callback-html.js";

describe("oauth callback html", () => {
  it("posts a success message to the opener and closes the popup", () => {
    const html = oauthCallbackSuccessHtml({
      uiOrigin: "http://127.0.0.1:5173",
      linkId: "link-1",
      provider: "notion",
      status: "success",
    });

    assert.match(html, /postMessage/);
    assert.match(html, /"type":"torii-oauth-link"/);
    assert.match(html, /"status":"success"/);
    assert.match(html, /"linkId":"link-1"/);
    assert.match(html, /http:\/\/127\.0\.0\.1:5173/);
    assert.match(html, /window\.close/);
  });

  it("omits postMessage when no ui origin was stored", () => {
    const html = oauthCallbackSuccessHtml({
      provider: "github",
      status: "success",
    });

    assert.doesNotMatch(html, /postMessage/);
  });

  it("escapes error text in the page body", () => {
    const html = oauthCallbackErrorHtml("access_denied <script>", {
      uiOrigin: "http://127.0.0.1:5173",
      linkId: "link-2",
      provider: "github",
      status: "error",
    });

    assert.match(html, /access_denied &lt;script&gt;/);
    assert.match(html, /"status":"error"/);
  });
});
