import { describe, expect, it } from "vitest";
import { shellUiReducer } from "../shell-ui-slice.js";

describe("shellUiReducer", () => {
  it("sets nav open state", () => {
    expect(
      shellUiReducer({ navOpen: false }, { type: "shell-ui/setNavOpen", navOpen: true }),
    ).toEqual({ navOpen: true });
  });

  it("toggles nav open state", () => {
    expect(shellUiReducer({ navOpen: false }, { type: "shell-ui/toggleNav" })).toEqual({
      navOpen: true,
    });
  });
});
