#!/usr/bin/env node
/**
 * Require a changeset when apps/ or packages/ source changes land without one.
 * Allows version-packages PRs (version bumps, changelogs, chart sync only).
 */
import { execSync } from "node:child_process";

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

try {
  run("pnpm exec changeset status --since=origin/main");
  console.log("Changeset status OK");
  process.exit(0);
} catch {
  // fall through to path-based check
}

const files = run("git diff --name-only origin/main...HEAD")
  .trim()
  .split("\n")
  .filter(Boolean);

const needsChangeset = files.some((file) => {
  if (file.endsWith("CHANGELOG.md")) return false;
  if (file === "deploy/k8s/chart/Chart.yaml") return false;
  if (file.startsWith(".changeset/")) return false;
  if (/^(apps|packages)\/[^/]+\/package\.json$/.test(file)) return false;
  if (file.startsWith("apps/") || file.startsWith("packages/")) return true;
  return false;
});

if (!needsChangeset) {
  console.log("Only release metadata changed; changeset not required");
  process.exit(0);
}

console.error(
  "Changes in apps/ or packages/ require a changeset. Run: pnpm changeset",
);
process.exit(1);
