"use strict";

/**
 * Emit the changeset summary as-is. prepare-release-changeset.mjs already
 * writes a markdown list; wrapping it again produced `- - item` entries and
 * let GitHub changelog prefixes collide with that list.
 *
 * @type {import("@changesets/types").ChangelogFunctions}
 */
module.exports = {
  async getReleaseLine(changeset) {
    const summary = changeset.summary.trim();
    return summary;
  },
  async getDependencyReleaseLine(_changesets, dependenciesUpdated) {
    if (dependenciesUpdated.length === 0) return "";
    const deps = dependenciesUpdated
      .map((dep) => `  - ${dep.name}@${dep.newVersion}`)
      .join("\n");
    return `- Updated dependencies:\n${deps}`;
  },
};
