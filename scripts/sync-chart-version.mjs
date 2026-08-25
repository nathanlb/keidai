#!/usr/bin/env node
/**
 * Sync deploy/k8s/chart/Chart.yaml appVersion and version with the platform
 * semver from apps/fuda/package.json (all fixed-group packages share one version).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(
  readFileSync(join(root, "apps/fuda/package.json"), "utf8"),
).version;

const chartPath = join(root, "deploy/k8s/chart/Chart.yaml");
let chart = readFileSync(chartPath, "utf8");

chart = chart.replace(/^version: .+$/m, `version: ${version}`);
chart = chart.replace(/^appVersion: .+$/m, `appVersion: "${version}"`);

writeFileSync(chartPath, chart);
console.log(`Synced Chart.yaml to ${version}`);
