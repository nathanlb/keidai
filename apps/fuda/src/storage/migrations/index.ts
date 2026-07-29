import { migration001Baseline } from "./001_baseline.js";
import { migration002AgentSchema } from "./002_agent_schema.js";
import type { Migration } from "../migrate.js";

export const fudaMigrations: readonly Migration[] = [
  migration001Baseline,
  migration002AgentSchema,
];
