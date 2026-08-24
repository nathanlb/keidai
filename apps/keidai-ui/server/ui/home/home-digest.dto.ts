import type {
  ApprovalRecordView,
  GroupView,
  RunReport,
  SavedTask,
} from "@keidai/shared";
import type { RunVisibilityListItem } from "../runs/runs-visibility.dto.js";

/** Max items loaded for the home dashboard digest (matches client list buffers). */
export const HOME_DIGEST_LIST_LIMIT = 200;

export interface HomeDigestAgent {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  groups: string[];
  persona: string;
  currentPersonaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface HomeDigestSourcesResponse {
  approvals: ApprovalRecordView[];
  runs: RunVisibilityListItem[];
  runReports: Record<string, RunReport>;
  tasks: SavedTask[];
  agents: HomeDigestAgent[];
  groups: GroupView[];
}
