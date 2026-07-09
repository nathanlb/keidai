import type {
  CompleteRunRequest,
  CreateRunRequest,
  RunListItem,
  RunReport,
  RunStep,
} from "@keidai/shared";

export const DEFAULT_RUN_LIST_LIMIT = 50;
export const MAX_RUN_LIST_LIMIT = 200;
export const DEFAULT_RUN_RETENTION_COUNT = 200;

export interface RunRepository {
  create(input: CreateRunRequest): RunReport;
  appendStep(runId: string, step: RunStep): RunReport | null;
  complete(runId: string, input: CompleteRunRequest): RunReport | null;
  get(runId: string): RunReport | null;
  list(limit?: number): { runs: RunListItem[] };
}
