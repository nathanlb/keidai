#!/usr/bin/env node
/**
 * Assert all workspace package versions and Chart.yaml appVersion match.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const packagePaths = [
  "apps/fuda/package.json",
  "apps/torii/package.json",
  "apps/shaiden/package.json",
  "apps/keidai-ui/package.json",
  "packages/shared/package.json",
  "packages/ui/package.json",
  "packages/postgres/package.json",
];

const versions = packagePaths.map((rel) => {
  const version = JSON.parse(readFileSync(join(root, rel), "utf8")).version;
  return { rel, version };
});

const expected = versions[0].version;
const mismatches = versions.filter((p) => p.version !== expected);

if (mismatches.length > 0) {
  console.error("Package version mismatch:");
  for (const { rel, version } of versions) {
    console.error(`  ${rel}: ${version}`);
  }
  process.exit(1);
}

const chartPath = join(root, "deploy/k8s/chart/Chart.yaml");
const chart = readFileSync(chartPath, "utf8");
const appVersionMatch = chart.match(/^appVersion: "(.+)"$/m);

if (!appVersionMatch || appVersionMatch[1] !== expected) {
  console.error(
    `Chart.yaml appVersion (${appVersionMatch?.[1] ?? "missing"}) does not match package version (${expected})`,
  );
  process.exit(1);
}

console.log(`All versions aligned at ${expected}`);
