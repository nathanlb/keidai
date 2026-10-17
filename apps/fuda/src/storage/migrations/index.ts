import type { Migration } from "@keidai/postgres";
import { migration001Baseline } from "./001_baseline.js";
import { migration002AgentDefaultModel } from "./002_agent_default_model.js";
import { migration003AgentEmoji } from "./003_agent_emoji.js";
import { migration004OwnerIdentity } from "./004_owner_identity.js";

export const fudaMigrations: readonly Migration[] = [
  migration001Baseline,
  migration002AgentDefaultModel,
  migration003AgentEmoji,
  migration004OwnerIdentity,
];
