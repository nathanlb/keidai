import { RUNS_PATH, TASKS_PATH } from "../shell/navigation.js";

export { RUNS_PATH, TASKS_PATH };

export const NEW_TASK_PARAM = "new_task";
export const TASK_PARAM = "task";
export const RUN_ID_PARAM = "run";
export const NEW_TASK_HREF = `${RUNS_PATH}?${NEW_TASK_PARAM}=1`;
export const TASKS_NEW_HREF = `${TASKS_PATH}?${NEW_TASK_PARAM}=1`;

export function taskEditHref(taskId: string): string {
  return `${TASKS_PATH}/${encodeURIComponent(taskId)}`;
}

export function runDetailHref(runId: string): string {
  return `${RUNS_PATH}/${encodeURIComponent(runId)}`;
}
