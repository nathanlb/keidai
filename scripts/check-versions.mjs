#!/usr/bin/env node
/**
 * Assert all workspace package versions and Chart.yaml version + appVersion match.
 * Chart.version is the GHCR OCI tag; appVersion is the default image tag.
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
const strip = (value) => value.trim().replaceAll('"', "");
const chartVersionMatch = chart.match(/^version:\s*(.+)$/m);
const appVersionMatch = chart.match(/^appVersion:\s*(.+)$/m);
const chartVersion = chartVersionMatch ? strip(chartVersionMatch[1]) : undefined;
const appVersion = appVersionMatch ? strip(appVersionMatch[1]) : undefined;

if (chartVersion !== expected || appVersion !== expected) {
  console.error(
    `Chart.yaml version (${chartVersion ?? "missing"}) / appVersion (${appVersion ?? "missing"}) does not match package version (${expected})`,
  );
  process.exit(1);
}

console.log(`All versions aligned at ${expected}`);
