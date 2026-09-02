/**
 * Deterministic changelog text from conventional commits.
 * Used by prepare-release-changeset.mjs; kept free of git/IO so it is testable.
 */

export const DEFAULT_REPO = "nathanlb/keidai";

const CONVENTIONAL =
  /^(?<type>feat|fix|perf|refactor|docs|style|test|build|ci|chore|revert)(?<scope>\([^)]+\))?(?<breaking>!)?:\s*(?<description>.+)$/i;

const ALWAYS_SKIP = [
  /^(Merge (pull request|branch)|Merged in )\b/i,
  /^Release \d+\.\d+\.\d+\b/,
  /^chore\(release\):/i,
  /^version packages\b/i,
];

/** Types omitted from minor/major changelogs; included when --bump patch. */
const PATCH_ONLY_TYPES = new Set(["chore", "test", "style"]);

const GROUP_HEADINGS = {
  breaking: "Breaking Changes",
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
  docs: "Documentation",
  refactor: "Refactors",
  revert: "Reverts",
  build: "Build",
  ci: "CI",
  chore: "Maintenance",
  other: "Other",
};

const GROUP_ORDER = [
  "breaking",
  "feat",
  "fix",
  "perf",
  "docs",
  "refactor",
  "revert",
  "build",
  "ci",
  "chore",
  "other",
];

/**
 * @param {string} subject
 * @returns {boolean}
 */
export function isAlwaysSkipped(subject) {
  const trimmed = subject.trim();
  return ALWAYS_SKIP.some((re) => re.test(trimmed));
}

/**
 * @param {string} subject
 * @returns {string | undefined}
 */
export function conventionalType(subject) {
  return subject.trim().match(CONVENTIONAL)?.groups?.type?.toLowerCase();
}

/**
 * @param {string} subject
 * @param {"patch" | "minor" | "major"} bump
 * @returns {boolean}
 */
export function isPatchOnlyNoise(subject, bump) {
  if (bump === "patch") return false;
  const type = conventionalType(subject);
  return type !== undefined && PATCH_ONLY_TYPES.has(type);
}

/**
 * @param {{ subject: string; body?: string }} commit
 * @param {"patch" | "minor" | "major"} bump
 * @returns {boolean}
 */
export function shouldIncludeCommit(commit, bump) {
  const subject = commit.subject.trim();
  if (!subject) return false;
  if (isAlwaysSkipped(subject)) return false;
  if (isPatchOnlyNoise(subject, bump)) return false;
  return true;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function sentenceCase(text) {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Turn `#123` into a pull-request markdown link. Commits without a PR number
 * get a short SHA link when `hash` is provided.
 *
 * @param {string} text
 * @param {{ repo: string; hash?: string }} opts
 * @returns {string}
 */
export function linkReferences(text, { repo, hash }) {
  const base = `https://github.com/${repo}`;
  const withPrs = text.replace(
    /(?<!\[)#(\d+)(?!\])/g,
    `[#$1](${base}/pull/$1)`,
  );
  if (/#\d+/.test(text) || !hash) return withPrs;
  const short = hash.slice(0, 7);
  return `${withPrs} ([\`${short}\`](${base}/commit/${hash}))`;
}

/**
 * @param {string} [body]
 * @returns {boolean}
 */
function bodyHasBreakingFooter(body) {
  return /^BREAKING[- ]CHANGE:/m.test(body ?? "");
}

/**
 * @param {{ subject: string; body?: string; hash?: string }} commit
 * @param {string} repo
 * @returns {{ group: keyof typeof GROUP_HEADINGS; text: string }}
 */
export function classifyCommit(commit, repo) {
  const subject = commit.subject.trim();
  const match = subject.match(CONVENTIONAL);
  const breaking =
    Boolean(match?.groups?.breaking) || bodyHasBreakingFooter(commit.body);

  if (!match) {
    return {
      group: breaking ? "breaking" : "other",
      text: linkReferences(sentenceCase(subject), {
        repo,
        hash: commit.hash,
      }),
    };
  }

  const type = match.groups.type.toLowerCase();
  const description = sentenceCase(match.groups.description);
  const group = breaking
    ? "breaking"
    : type in GROUP_HEADINGS && type !== "other"
      ? type
      : "other";

  return {
    group,
    text: linkReferences(description, { repo, hash: commit.hash }),
  };
}

/**
 * @param {object} opts
 * @param {{ subject: string; body?: string; hash?: string }[]} opts.commits
 * @param {"patch" | "minor" | "major"} opts.bump
 * @param {string} [opts.notes]
 * @param {string} [opts.repo]
 * @returns {string}
 */
export function formatChangelog({
  commits,
  bump,
  notes = "",
  repo = DEFAULT_REPO,
}) {
  const included = commits.filter((c) => shouldIncludeCommit(c, bump));
  /** @type {Map<string, string[]>} */
  const grouped = new Map();
  for (const commit of included) {
    const { group, text } = classifyCommit(commit, repo);
    const lines = grouped.get(group) ?? [];
    lines.push(text);
    grouped.set(group, lines);
  }

  const sections = [];
  const maintainerNotes = notes.trim();
  if (maintainerNotes) {
    sections.push(`**Notes**\n\n${maintainerNotes}`);
  }

  const present = GROUP_ORDER.filter((group) => grouped.has(group));
  const omitHeadings = present.length === 1 && !maintainerNotes;

  for (const group of present) {
    const bullets = grouped.get(group).map((line) => `- ${line}`).join("\n");
    if (omitHeadings) {
      sections.push(bullets);
    } else {
      sections.push(`**${GROUP_HEADINGS[group]}**\n\n${bullets}`);
    }
  }

  return sections.join("\n\n");
}

/**
 * @param {string} bump
 * @param {string[]} packageNames
 * @returns {string}
 */
export function changesetFrontmatter(bump, packageNames) {
  const entries = packageNames.map((name) => `"${name}": ${bump}`);
  return `---\n${entries.join("\n")}\n---`;
}
