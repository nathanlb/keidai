import { Run } from "@keidai/shared";
import { DiscoveredTool } from "../../mcp/types/index.js";

export interface HarnessRunResult {
    run: Run;
    discoveredTools: DiscoveredTool[];
    iterations: number;
  }