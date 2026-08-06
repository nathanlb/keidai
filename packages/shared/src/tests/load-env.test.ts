import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { findPackageRoot, findRepoRoot } from "../load-env.js";

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

describe("findPackageRoot", () => {
  it("walks up from a nested dist entry to the package root", () => {
    const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));
    assert.ok(repoRoot);
    const nested = path.join(repoRoot, "apps", "keidai-ui", "dist", "server");
    const packageRoot = findPackageRoot(nested);

    assert.equal(packageRoot, path.join(repoRoot, "apps", "keidai-ui"));
    assert.ok(existsSync(path.join(packageRoot, "package.json")));
  });
});
