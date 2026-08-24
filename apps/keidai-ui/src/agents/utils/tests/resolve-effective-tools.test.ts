import type { GroupView } from "@keidai/shared";
import { describe, expect, it } from "vitest";
import type { ServerCatalogue } from "../../../groups/types/group-editor.js";
import {
  filterEffectiveTools,
  resolveEffectiveTools,
} from "../resolve-effective-tools.js";

const gmailCatalogue: ServerCatalogue = {
  tools: [
    { name: "messages.list", description: "List inbox threads" },
    { name: "messages.send", description: "Send a message" },
    { name: "messages.delete", description: "Delete a message" },
    { name: "drafts.create", description: "Create a draft" },
  ],
  available: true,
};

const slackCatalogue: ServerCatalogue = {
  tools: [
    { name: "chat.post", description: "Post a message" },
    { name: "chat.update", description: "Edit a message" },
  ],
  available: true,
};

function group(
  name: string,
  servers: GroupView["servers"],
  description = `${name} policy`,
): GroupView {
  return {
    id: `grp-${name}`,
    name,
    description,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    servers,
  };
}

const opsWrite = group("ops-write", [
  {
    server: "gmail",
    default: "deny",
    allow: ["messages.list", "drafts.create"],
    deny: [],
    gated: ["messages.send"],
  },
]);

const financeRead = group("finance-read", [
  {
    server: "gmail",
    default: "deny",
    allow: ["messages.list"],
    deny: ["messages.send"],
    gated: [],
  },
]);

const slackBroad = group("slack-broad", [
  {
    server: "slack",
    default: "allow",
    allow: [],
    deny: ["chat.update"],
    gated: [],
  },
]);

describe("resolveEffectiveTools", () => {
  it("lets an explicit deny win over an allow or gate in another group", () => {
    const result = resolveEffectiveTools(
      ["ops-write", "finance-read"],
      [opsWrite, financeRead],
      { gmail: gmailCatalogue },
    );
    const send = result.servers[0]?.tools.find(
      (tool) => tool.name === "messages.send",
    );
    expect(send?.state).toBe("deny");
    expect(send?.conflict).toBe(true);
    expect(send?.reason).toContain("grants it");
    expect(send?.reason).toContain("denies it");
    expect(result.conflicts).toEqual([
      {
        server: "gmail",
        tool: "messages.send",
        grantedBy: "ops-write",
        deniedBy: "finance-read",
      },
    ]);
  });

  it("treats a gated tool as reachable", () => {
    const result = resolveEffectiveTools(["ops-write"], [opsWrite], {
      gmail: gmailCatalogue,
    });
    const send = result.servers[0]?.tools.find(
      (tool) => tool.name === "messages.send",
    );
    expect(send?.state).toBe("gated");
    expect(send?.reason).toBe("via ops-write");
    expect(result.gatedCount).toBe(1);
    expect(result.permittedCount).toBe(2);
  });

  it("flags a grant that exists only because of default allow", () => {
    const result = resolveEffectiveTools(["slack-broad"], [slackBroad], {
      slack: slackCatalogue,
    });
    const post = result.servers[0]?.tools.find(
      (tool) => tool.name === "chat.post",
    );
    const update = result.servers[0]?.tools.find(
      (tool) => tool.name === "chat.update",
    );
    expect(post?.state).toBe("permit");
    expect(post?.defaultAllow).toBe(true);
    expect(post?.reason).toBe("via slack-broad's default allow");
    expect(update?.state).toBe("deny");
    expect(update?.defaultAllow).toBe(false);
  });

  it("denies tools no membership group grants, and ignores unknown names", () => {
    const result = resolveEffectiveTools(
      ["ops-write", "ghost-group"],
      [opsWrite],
      { gmail: gmailCatalogue },
    );
    const del = result.servers[0]?.tools.find(
      (tool) => tool.name === "messages.delete",
    );
    expect(del?.state).toBe("deny");
    expect(del?.reason).toBe("no group grants it");
    expect(result.definedGroupCount).toBe(1);
  });

  it("filters rows by state without dropping server sections", () => {
    const result = resolveEffectiveTools(["ops-write"], [opsWrite], {
      gmail: gmailCatalogue,
    });
    const gated = filterEffectiveTools(result, "gated");
    expect(gated[0]?.tools.map((tool) => tool.name)).toEqual(["messages.send"]);
    expect(filterEffectiveTools(result, "all")[0]?.tools.length).toBe(
      result.servers[0]?.tools.length,
    );
  });
});
