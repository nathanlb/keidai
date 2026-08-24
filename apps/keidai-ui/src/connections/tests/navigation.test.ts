import { describe, expect, it } from "vitest";
import { CONNECTIONS_PATH, PROVIDERS_PATH } from "../navigation.js";

describe("torii configure paths", () => {
  it("lives under /configure", () => {
    expect(CONNECTIONS_PATH).toBe("/configure/connections");
    expect(PROVIDERS_PATH).toBe("/configure/providers");
  });
});
