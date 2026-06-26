import { describe, expect, it } from "vitest";
import { themeReducer } from "../theme-slice.js";

describe("themeReducer", () => {
  it("sets the theme explicitly", () => {
    expect(themeReducer({ theme: "dark" }, { type: "theme/set", theme: "light" })).toEqual({
      theme: "light",
    });
  });

  it("toggles between light and dark", () => {
    expect(themeReducer({ theme: "dark" }, { type: "theme/toggle" })).toEqual({
      theme: "light",
    });
    expect(themeReducer({ theme: "light" }, { type: "theme/toggle" })).toEqual({
      theme: "dark",
    });
  });
});
