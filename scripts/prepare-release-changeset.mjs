#!/usr/bin/env node
/**
 * Gather main-branch commits since the last v* tag, write a changeset whose
 * summary is a deterministic conventional-commit changelog, and optionally
 * dump that markdown for the Release PR body.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import {
  DEFAULT_REPO,
  changesetFrontmatter,
  formatChangelog,
} from "./lib/release-changelog.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const { values, positionals } = parseArgs({
  options: {
    bump: { type: "string" },
    notes: { type: "string", default: "" },
    since: { type: "string" },
    repo: { type: "string" },
    "pr-body-out": { type: "string" },
  },
  allowPositionals: true,
});

const bump = values.bump ?? positionals[0];
if (!bump || !["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: prepare-release-changeset.mjs --bump patch|minor|major");
  process.exit(1);
}

const repo =
  values.repo?.trim() ||
  process.env.GITHUB_REPOSITORY?.trim() ||
  DEFAULT_REPO;

const LOG_FORMAT = "----%ncommit %H%n subject %s%n body %b";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: root }).trim();
}

const pending = readdirSync(join(root, ".changeset")).filter(
  (name) => name.endsWith(".md") && name.toLowerCase() !== "readme.md",
);
if (pending.length > 0) {
  console.error(
    `Pending changeset(s) already exist: ${pending.join(", ")}. Merge or remove them first.`,
  );
  process.exit(1);
}

const changesetConfig = JSON.parse(
  readFileSync(join(root, ".changeset/config.json"), "utf8"),
);
const packageNames = changesetConfig.fixed?.[0];
if (!Array.isArray(packageNames) || packageNames.length === 0) {
  console.error("Expected .changeset/config.json fixed[0] to list platform packages");
  process.exit(1);
}

let sinceRef = values.since?.trim();
if (!sinceRef) {
  try {
    sinceRef = git(["describe", "--tags", "--abbrev=0", "--match", "v*"]);
  } catch {
    console.error("No v* tag found; pass --since explicitly");
    process.exit(1);
  }
}

const rawLog = git([
  "log",
  `${sinceRef}..HEAD`,
  `--format=${LOG_FORMAT}`,
]);

if (!rawLog) {
  console.error(`No commits between ${sinceRef} and HEAD; nothing to release`);
  process.exit(1);
}

/** @type {{ hash: string; subject: string; body: string }[]} */
const commits = [];
for (const block of rawLog.split(/^----$/m)) {
  const trimmed = block.trim();
  if (!trimmed) continue;

  const hash = trimmed.match(/^commit (\S+)/m)?.[1] ?? "";
  const subject = trimmed.match(/^ subject (.+)$/m)?.[1] ?? "";
  const body = trimmed.match(/^ body ([\s\S]*)$/m)?.[1]?.trim() ?? "";

  if (!hash || !subject) continue;
  commits.push({ hash, subject, body });
}

const changelog = formatChangelog({
  commits,
  bump,
  notes: values.notes,
  repo,
});

if (!changelog.trim()) {
  console.error(
    bump === "patch"
      ? `No commits between ${sinceRef} and HEAD; nothing to release`
      : `No releasable commits between ${sinceRef} and HEAD after filtering noise (use --bump patch to include chore commits)`,
  );
  process.exit(1);
}

const shortSha = git(["rev-parse", "--short", "HEAD"]);
const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const filename = `prepare-release-${date}-${shortSha}.md`;
const changesetPath = join(root, ".changeset", filename);

writeFileSync(
  changesetPath,
  `${changesetFrontmatter(bump, packageNames)}\n\n${changelog}\n`,
);

const prBodyOut = values["pr-body-out"]?.trim();
if (prBodyOut) {
  writeFileSync(prBodyOut, `${changelog}\n`);
}

console.log(`Wrote ${changesetPath}`);
console.log(`Changelog since ${sinceRef}:\n`);
console.log(changelog);
