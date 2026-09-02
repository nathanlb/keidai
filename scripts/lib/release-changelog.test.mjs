import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import {
  classifyCommit,
  formatChangelog,
  isAlwaysSkipped,
  isPatchOnlyNoise,
  linkReferences,
  sentenceCase,
  shouldIncludeCommit,
  changesetFrontmatter,
} from "./release-changelog.mjs";

const require = createRequire(import.meta.url);
const changesetChangelog = require("../../.changeset/changelog.cjs");

describe("isAlwaysSkipped", () => {
  it("skips merge commits, release PRs, and chore(release)", () => {
    assert.equal(isAlwaysSkipped("Merge pull request #12 from origin/main"), true);
    assert.equal(isAlwaysSkipped("Merge branch 'main' into feat/x"), true);
    assert.equal(isAlwaysSkipped("Release 0.3.0 (#131)"), true);
    assert.equal(isAlwaysSkipped("chore(release): bump workflows"), true);
    assert.equal(isAlwaysSkipped("version packages"), true);
    assert.equal(isAlwaysSkipped("feat(tasks): add schedules (#135)"), false);
    assert.equal(isAlwaysSkipped("chore(deps): bump vite"), false);
  });
});

describe("isPatchOnlyNoise", () => {
  it("drops chore/test/style on minor and major, keeps them on patch", () => {
    assert.equal(isPatchOnlyNoise("chore(deps): bump vite (#119)", "minor"), true);
    assert.equal(isPatchOnlyNoise("chore(deps): bump vite (#119)", "major"), true);
    assert.equal(isPatchOnlyNoise("chore(deps): bump vite (#119)", "patch"), false);
    assert.equal(isPatchOnlyNoise("test: cover schedules", "minor"), true);
    assert.equal(isPatchOnlyNoise("feat(tasks): add schedules", "minor"), false);
  });
});

describe("shouldIncludeCommit", () => {
  it("requires a subject and respects bump filtering", () => {
    assert.equal(
      shouldIncludeCommit({ subject: "feat: add foo" }, "minor"),
      true,
    );
    assert.equal(shouldIncludeCommit({ subject: "   " }, "minor"), false);
    assert.equal(
      shouldIncludeCommit({ subject: "chore(deps): bump" }, "minor"),
      false,
    );
    assert.equal(
      shouldIncludeCommit({ subject: "chore(deps): bump" }, "patch"),
      true,
    );
    assert.equal(
      shouldIncludeCommit({ subject: "chore(release): workflows" }, "patch"),
      false,
    );
  });
});

describe("sentenceCase", () => {
  it("capitalizes the first character only", () => {
    assert.equal(sentenceCase("refactor task authoring"), "Refactor task authoring");
    assert.equal(sentenceCase("Fix MCP handshake"), "Fix MCP handshake");
  });
});

describe("linkReferences", () => {
  it("turns (#123) into a pull request link", () => {
    assert.equal(
      linkReferences("Add schedules (#135)", { repo: "nathanlb/keidai" }),
      "Add schedules ([#135](https://github.com/nathanlb/keidai/pull/135))",
    );
  });

  it("appends a commit link when there is no PR number", () => {
    assert.equal(
      linkReferences("Add schedules", {
        repo: "nathanlb/keidai",
        hash: "9825837abc",
      }),
      "Add schedules ([`9825837`](https://github.com/nathanlb/keidai/commit/9825837abc))",
    );
  });

  it("does not wrap an existing markdown PR link", () => {
    const already =
      "Add schedules ([#135](https://github.com/nathanlb/keidai/pull/135))";
    assert.equal(linkReferences(already, { repo: "nathanlb/keidai" }), already);
  });
});

describe("classifyCommit", () => {
  it("strips the conventional prefix and maps feat to Features", () => {
    const { group, text } = classifyCommit(
      {
        hash: "abc",
        subject: "feat(tasks): refactor task authoring and introducing scheduled tasks (#135)",
      },
      "nathanlb/keidai",
    );
    assert.equal(group, "feat");
    assert.equal(
      text,
      "Refactor task authoring and introducing scheduled tasks ([#135](https://github.com/nathanlb/keidai/pull/135))",
    );
  });

  it("treats feat! and BREAKING CHANGE footers as breaking", () => {
    assert.equal(
      classifyCommit({ subject: "feat!: drop sqlite" }, "nathanlb/keidai").group,
      "breaking",
    );
    assert.equal(
      classifyCommit(
        {
          subject: "feat(fuda): migrate to postgres",
          body: "Details.\n\nBREAKING CHANGE: SQLite is no longer supported.",
        },
        "nathanlb/keidai",
      ).group,
      "breaking",
    );
  });

  it("puts unmatched subjects in Other", () => {
    assert.equal(
      classifyCommit({ subject: "tweak the footer" }, "nathanlb/keidai").group,
      "other",
    );
  });
});

describe("formatChangelog", () => {
  it("groups mixed conventional commits and omits chore on a minor bump", () => {
    const markdown = formatChangelog({
      bump: "minor",
      repo: "nathanlb/keidai",
      commits: [
        {
          hash: "9825837",
          subject:
            "feat(tasks): refactor task authoring and introducing scheduled tasks (#135)",
        },
        {
          hash: "6519d1e",
          subject:
            "feat(home): enhance system map functionality and UI components (#133)",
        },
        {
          hash: "eda9e88",
          subject:
            "refactor: update navigation and routing for groups, replacing configure path with direct access to policy groups (#132)",
        },
        {
          hash: "a9abe52",
          subject: "chore(release): enhance Helm chart and workflows",
        },
        {
          hash: "1165a5f",
          subject: "chore(deps): upgrade to vite v8 (#119)",
        },
      ],
    });

    assert.equal(
      markdown,
      [
        "**Features**",
        "",
        "- Refactor task authoring and introducing scheduled tasks ([#135](https://github.com/nathanlb/keidai/pull/135))",
        "- Enhance system map functionality and UI components ([#133](https://github.com/nathanlb/keidai/pull/133))",
        "",
        "**Refactors**",
        "",
        "- Update navigation and routing for groups, replacing configure path with direct access to policy groups ([#132](https://github.com/nathanlb/keidai/pull/132))",
      ].join("\n"),
    );
    assert.doesNotMatch(markdown, /vite v8/);
    assert.doesNotMatch(markdown, /^- -/m);
  });

  it("omits group headings when every commit is the same type", () => {
    const markdown = formatChangelog({
      bump: "minor",
      commits: [{ hash: "abc", subject: "fix: handle missing approval tokens (#12)" }],
    });
    assert.equal(
      markdown,
      "- Handle missing approval tokens ([#12](https://github.com/nathanlb/keidai/pull/12))",
    );
  });

  it("includes chore commits on a patch bump", () => {
    const markdown = formatChangelog({
      bump: "patch",
      commits: [{ hash: "1165a5f", subject: "chore(deps): upgrade to vite v8 (#119)" }],
    });
    assert.match(markdown, /Upgrade to vite v8/);
  });

  it("prepends maintainer notes without sending them through a model", () => {
    const markdown = formatChangelog({
      bump: "minor",
      notes: "Scheduled tasks are the headline for operators.",
      commits: [{ hash: "abc", subject: "feat: add schedules (#135)" }],
    });
    assert.equal(
      markdown,
      [
        "**Notes**",
        "",
        "Scheduled tasks are the headline for operators.",
        "",
        "**Features**",
        "",
        "- Add schedules ([#135](https://github.com/nathanlb/keidai/pull/135))",
      ].join("\n"),
    );
  });
});

describe("changesetFrontmatter", () => {
  it("lists every package so each app changelog gets the notes", () => {
    assert.equal(
      changesetFrontmatter("minor", ["@keidai/fuda", "@keidai/torii"]),
      ['---', '"@keidai/fuda": minor', '"@keidai/torii": minor', '---'].join("\n"),
    );
  });
});

describe("changeset changelog adapter", () => {
  it("emits the summary as its own markdown instead of wrapping it in another list item", async () => {
    const summary = [
      "**Features**",
      "",
      "- Add schedules ([#135](https://github.com/nathanlb/keidai/pull/135))",
    ].join("\n");
    const line = await changesetChangelog.getReleaseLine({ summary });
    assert.equal(line, summary);
    assert.doesNotMatch(line, /^- -/m);
  });

  it("lists dependency bumps without an empty commit-link placeholder", async () => {
    const line = await changesetChangelog.getDependencyReleaseLine([], [
      { name: "@keidai/shared", newVersion: "0.4.0" },
    ]);
    assert.equal(
      line,
      "- Updated dependencies:\n  - @keidai/shared@0.4.0",
    );
  });
});
