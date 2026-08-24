import type { GroupServerPolicyView } from "@keidai/shared";

export type ToolEffect = "allowed" | "denied" | "gated";

export interface CatalogueTool {
  name: string;
  description?: string;
}

export interface ServerCatalogue {
  tools: CatalogueTool[];
  /** False when the connection is down, the list failed, or the backend advertised nothing. */
  available: boolean;
  unavailableReason?: string;
}

export interface ExplicitToolRule {
  name: string;
  description: string;
  effect: ToolEffect;
  advertised: boolean;
}

export type GroupServerPolicyDraft = GroupServerPolicyView;
