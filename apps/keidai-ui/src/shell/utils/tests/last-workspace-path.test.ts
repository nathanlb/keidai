import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_PATH,
  LAST_WORKSPACE_PATH_KEY,
  readLastWorkspacePath,
  writeLastWorkspacePath,
} from "../last-workspace-path.js";

afterEach(() => {
  sessionStorage.clear();
});

describe("last workspace path", () => {
  it("defaults to home when nothing is stored", () => {
    expect(readLastWorkspacePath()).toBe(DEFAULT_WORKSPACE_PATH);
  });

  it("round-trips a workspace href", () => {
    writeLastWorkspacePath("/runs/4821");
    expect(sessionStorage.getItem(LAST_WORKSPACE_PATH_KEY)).toBe("/runs/4821");
    expect(readLastWorkspacePath()).toBe("/runs/4821");
  });

  it("ignores configure paths so the fallback cannot loop", () => {
    writeLastWorkspacePath("/configure/connections?return=/home");
    expect(readLastWorkspacePath()).toBe(DEFAULT_WORKSPACE_PATH);
  });
});
