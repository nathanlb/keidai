import type { Migration } from "@keidai/postgres";
import { migration001Baseline } from "./001_baseline.js";
import { migration002AgentDefaultModel } from "./002_agent_default_model.js";

export const fudaMigrations: readonly Migration[] = [
  migration001Baseline,
  migration002AgentDefaultModel,
];
