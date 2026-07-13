import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { findRepoRoot } from "../load-env.js";

describe("findRepoRoot", () => {
  it("finds the monorepo root from a package directory", () => {
    const packageRoot = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
    );
    const repoRoot = findRepoRoot(packageRoot);

    assert.ok(repoRoot);
    assert.ok(existsSync(path.join(repoRoot!, "pnpm-workspace.yaml")));
    assert.ok(existsSync(path.join(repoRoot!, "apps", "torii")));
    assert.ok(existsSync(path.join(repoRoot!, "apps", "shaiden")));
  });
});
