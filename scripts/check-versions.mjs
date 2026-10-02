#!/usr/bin/env node
/**
 * Assert the platform semver is one version.
 *
 * The changesets fixed group is what prepare-release bumps. Every workspace
 * package with a Dockerfile must be in that group, and every package in the
 * group must share Chart.yaml's version and appVersion.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const changesetConfig = JSON.parse(
  readFileSync(join(root, ".changeset/config.json"), "utf8"),
);
const fixed = changesetConfig.fixed?.[0];
if (!Array.isArray(fixed) || fixed.length === 0) {
  console.error(
    "Expected .changeset/config.json fixed[0] to list platform packages",
  );
  process.exit(1);
}

const packages = [];
for (const dir of ["apps", "packages"]) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    const pkgPath = join(root, rel, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    packages.push({
      name: pkg.name,
      version: pkg.version,
      rel: `${rel}/package.json`,
      hasDockerfile: existsSync(join(root, rel, "Dockerfile")),
    });
  }
}

const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
let failed = false;

for (const name of fixed) {
  if (!byName.has(name)) {
    console.error(`Fixed-group package ${name} has no workspace package.json`);
    failed = true;
  }
}

for (const pkg of packages) {
  if (pkg.hasDockerfile && !fixed.includes(pkg.name)) {
    console.error(
      `${pkg.rel} ships a Dockerfile but ${pkg.name} is not in .changeset/config.json fixed[0], so prepare-release will not bump it`,
    );
    failed = true;
  }
}

const versioned = fixed
  .map((name) => byName.get(name))
  .filter((pkg) => pkg !== undefined);
const expected = versioned[0]?.version;
for (const pkg of versioned) {
  if (pkg.version !== expected) {
    console.error(`${pkg.rel}: ${pkg.version} (expected ${expected})`);
    failed = true;
  }
}

const chart = readFileSync(join(root, "deploy/k8s/chart/Chart.yaml"), "utf8");
const strip = (value) => value.trim().replaceAll('"', "");
const chartVersion = chart.match(/^version:\s*(.+)$/m)?.[1];
const appVersion = chart.match(/^appVersion:\s*(.+)$/m)?.[1];
const chartVersionValue = chartVersion ? strip(chartVersion) : undefined;
const appVersionValue = appVersion ? strip(appVersion) : undefined;

if (chartVersionValue !== expected || appVersionValue !== expected) {
  console.error(
    `Chart.yaml version (${chartVersionValue ?? "missing"}) / appVersion (${appVersionValue ?? "missing"}) does not match package version (${expected})`,
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log(`All versions aligned at ${expected}`);
