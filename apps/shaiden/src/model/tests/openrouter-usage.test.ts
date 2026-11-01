import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withOpenRouterUsageAccounting } from "../openrouter.js";

describe("withOpenRouterUsageAccounting", () => {
  it("asks OpenRouter to include per-request cost on chat completions", async () => {
    let seen: unknown;
    const fetchImpl: typeof fetch = async (_input, init) => {
      seen = JSON.parse(String(init?.body));
      return new Response("{}", { status: 200 });
    };

    await withOpenRouterUsageAccounting(fetchImpl)(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        body: JSON.stringify({
          model: "~deepseek/deepseek-v4-flash-latest",
          messages: [{ role: "user", content: "hi" }],
        }),
      },
    );

    assert.deepEqual(seen, {
      model: "~deepseek/deepseek-v4-flash-latest",
      messages: [{ role: "user", content: "hi" }],
      usage: { include: true },
    });
  });

  it("leaves bodies that are not chat completions unchanged", async () => {
    let seen = "";
    const fetchImpl: typeof fetch = async (_input, init) => {
      seen = String(init?.body);
      return new Response("{}", { status: 200 });
    };

    await withOpenRouterUsageAccounting(fetchImpl)(
      "https://openrouter.ai/api/v1/models",
      {
        method: "GET",
        body: "not-json",
      },
    );

    assert.equal(seen, "not-json");
  });
});
