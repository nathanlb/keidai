import { Logger, Run, Task } from "@keidai/shared";
import { DiscoveredTool } from "../../mcp/types/index.js";
import { ActiveRunRegistry } from "../active-run-registry.js";
import { RunStore } from "../../runs/run-store.js";
import { RuntimeConfig } from "../../config/runtime-config.js";
import { ConversationEntry } from "./conversation-history.js";
import { createLocalRunReporter } from "../run-reporter.js";

export interface HarnessRunResult {
    run: Run;
    discoveredTools: DiscoveredTool[];
    iterations: number;
  }

  export interface HarnessRunOptions {
    logger?: Logger;
    runStore?: RunStore;
    activeRunRegistry?: ActiveRunRegistry;
  }
  
  export interface LaunchHarnessRunInput {
    task: Task;
    taskId: string;
    config: RuntimeConfig;
    runStore: RunStore;
    options?: HarnessRunOptions;
  }
  
  export interface ResumeHarnessRunInput {
    runId: string;
    initialHistory: ConversationEntry[];
    task: Task;
    config: RuntimeConfig;
    runStore: RunStore;
    options?: HarnessRunOptions;
  }
  
  export interface LaunchedHarnessRun {
    runId: string;
    done: Promise<HarnessRunResult>;
  }

  export interface DriveHarnessRunInput {
    runId: string;
    task: Task;
    config: RuntimeConfig;
    reporter: ReturnType<typeof createLocalRunReporter>;
    logger: Logger;
    runStore: RunStore;
    initialHistory: ConversationEntry[];
    activeRunRegistry: ActiveRunRegistry;
  }