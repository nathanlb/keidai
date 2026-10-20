import { describe, expect, it } from "vitest";
import { applyTheme, themeReducer } from "../theme-slice.js";

describe("themeReducer", () => {
  it("sets the theme explicitly", () => {
    expect(
      themeReducer(
        { theme: "dark", palette: "default" },
        { type: "theme/set", theme: "light" },
      ),
    ).toEqual({
      theme: "light",
      palette: "default",
    });
  });

  it("toggles between light and dark while preserving palette", () => {
    expect(
      themeReducer(
        { theme: "dark", palette: "platinum" },
        { type: "theme/toggle" },
      ),
    ).toEqual({
      theme: "light",
      palette: "platinum",
    });
    expect(
      themeReducer(
        { theme: "light", palette: "default" },
        { type: "theme/toggle" },
      ),
    ).toEqual({
      theme: "dark",
      palette: "default",
    });
  });

  it("sets the palette explicitly", () => {
    expect(
      themeReducer(
        { theme: "dark", palette: "default" },
        { type: "theme/setPalette", palette: "platinum" },
      ),
    ).toEqual({
      theme: "dark",
      palette: "platinum",
    });
  });
});

describe("applyTheme", () => {
  it("toggles dark and theme-platinum on the document root", () => {
    applyTheme("dark", "platinum");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-platinum")).toBe(
      true,
    );

    applyTheme("light", "default");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("theme-platinum")).toBe(
      false,
    );
  });
});
