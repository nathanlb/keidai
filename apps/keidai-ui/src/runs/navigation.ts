import { RUNS_PATH, TASKS_PATH } from "../shell/navigation.js";

export { RUNS_PATH, TASKS_PATH };
export { taskEditHref } from "../tasks/navigation.js";

export const RUN_ID_PARAM = "run";

export function runDetailHref(runId: string): string {
  return `${RUNS_PATH}/${encodeURIComponent(runId)}`;
}
