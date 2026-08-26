#!/usr/bin/env node
/**
 * Gather main-branch commit messages since the last v* tag, generate a changeset
 * changelog via OpenRouter, and write .changeset/prepare-release-*.md
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemma-4-26b-a4b-it:free";
const LOG_CHAR_CAP = 50_000;

const NOISE_SUBJECT =
  /^(chore: prepare release|chore\(release\)|version packages|chore: version packages)/i;

const { values, positionals } = parseArgs({
  options: {
    bump: { type: "string" },
    notes: { type: "string", default: "" },
    since: { type: "string" },
    model: { type: "string", default: DEFAULT_MODEL },
  },
  allowPositionals: true,
});

const bump = values.bump ?? positionals[0];
if (!bump || !["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: prepare-release-changeset.mjs --bump patch|minor|major");
  process.exit(1);
}

const apiKey = process.env.OPEN_ROUTER_API_KEY?.trim();
if (!apiKey) {
  console.error("OPEN_ROUTER_API_KEY is required");
  process.exit(1);
}

function git(cmd) {
  return execSync(cmd, { encoding: "utf8", cwd: root }).trim();
}

const pending = readdirSync(join(root, ".changeset"))
  .filter((name) => name.endsWith(".md"));
if (pending.length > 0) {
  console.error(
    `Pending changeset(s) already exist: ${pending.join(", ")}. Merge or remove them first.`,
  );
  process.exit(1);
}

const currentVersion = JSON.parse(
  readFileSync(join(root, "apps/fuda/package.json"), "utf8"),
).version;

let sinceRef = values.since?.trim();
if (!sinceRef) {
  try {
    sinceRef = git("git describe --tags --abbrev=0 --match 'v*'");
  } catch {
    console.error("No v* tag found; pass --since explicitly");
    process.exit(1);
  }
}

const rawLog = git(
  `git log ${sinceRef}..HEAD --reverse --format=----%ncommit %H%nauthor %an%n date %ad%n subject %s%n body %b`,
);

if (!rawLog) {
  console.error(`No commits between ${sinceRef} and HEAD; nothing to release`);
  process.exit(1);
}

/** @type {{ hash: string; author: string; date: string; subject: string; body: string }[]} */
const commits = [];
for (const block of rawLog.split(/^----$/m)) {
  const trimmed = block.trim();
  if (!trimmed) continue;

  const hash = trimmed.match(/^commit (\S+)/m)?.[1] ?? "";
  const author = trimmed.match(/^author (.+)$/m)?.[1] ?? "";
  const date = trimmed.match(/^ date (.+)$/m)?.[1] ?? "";
  const subject = trimmed.match(/^ subject (.+)$/m)?.[1] ?? "";
  const body = trimmed.match(/^ body ([\s\S]*)$/m)?.[1]?.trim() ?? "";

  if (!hash || !subject) continue;
  if (NOISE_SUBJECT.test(subject)) continue;

  commits.push({ hash, author, date, subject, body });
}

if (commits.length === 0) {
  console.error(
    `No releasable commits between ${sinceRef} and HEAD after filtering noise`,
  );
  process.exit(1);
}

function formatCommitLog(entries) {
  return entries
    .map((c) => {
      const lines = [
        `commit ${c.hash}`,
        `author ${c.author}`,
        `date ${c.date}`,
        `subject ${c.subject}`,
      ];
      if (c.body) lines.push(`body ${c.body}`);
      return lines.join("\n");
    })
    .join("\n----\n");
}

let commitLog = formatCommitLog(commits);
let truncated = false;
if (commitLog.length > LOG_CHAR_CAP) {
  truncated = true;
  while (commitLog.length > LOG_CHAR_CAP && commits.length > 1) {
    commits.shift();
    commitLog = formatCommitLog(commits);
  }
  commitLog =
    `[Note: oldest commits omitted — log exceeded ${LOG_CHAR_CAP} characters]\n\n` +
    commitLog;
}

const systemPrompt = `You write Keidai platform release notes for operators and developers.
Synthesize the provided commit messages into a concise markdown bullet list.
Group related work; emphasize user-facing features, fixes, and operational changes.
Omit test-only tweaks, internal refactors, and chore noise unless operationally relevant.
Output ONLY markdown bullet lines (each starting with "- "). No heading, no frontmatter, no code fences.`;

const maintainerNotes = values.notes?.trim();
const userPrompt = [
  `Current platform version: ${currentVersion}`,
  `Requested bump: ${bump}`,
  `Commits since ${sinceRef}:`,
  truncated ? "(log truncated to fit context limits)" : "",
  maintainerNotes ? `Maintainer notes: ${maintainerNotes}` : "",
  "",
  commitLog,
]
  .filter(Boolean)
  .join("\n");

const llmResponse = await fetch(OPENROUTER_URL, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://github.com/nathanlb/keidai",
    "X-Title": "Keidai Release",
  },
  body: JSON.stringify({
    model: values.model ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  }),
});

if (!llmResponse.ok) {
  const errText = await llmResponse.text();
  console.error(`OpenRouter request failed (${llmResponse.status}): ${errText}`);
  process.exit(1);
}

const llmJson = await llmResponse.json();
let changelog = llmJson.choices?.[0]?.message?.content?.trim() ?? "";
if (!changelog) {
  console.error("OpenRouter returned empty changelog");
  process.exit(1);
}

changelog = changelog.replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "");

const shortSha = git("git rev-parse --short HEAD");
const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const filename = `prepare-release-${date}-${shortSha}.md`;
const changesetPath = join(root, ".changeset", filename);

const changesetBody = `---
"@keidai/fuda": ${bump}
---

${changelog}
`;

writeFileSync(changesetPath, changesetBody);
console.log(`Wrote ${changesetPath}`);
