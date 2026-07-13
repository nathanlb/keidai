import type { AgentPrincipal } from "@keidai/shared";
import type { ValidatedAgentSubject } from "./validated-agent-subject.js";

/** Maps a validated workload identity to an internal {@link AgentPrincipal}. */
export interface AgentRegistry {
  lookup(subject: ValidatedAgentSubject): AgentPrincipal;
}
