import { TASKS_PATH } from "../shell/navigation.js";

export { TASKS_PATH };

export const TASKS_NEW_PATH = `${TASKS_PATH}/new`;
export const TASK_ASSIGNEE_PARAM = "assignee";

/** Retired query-param authoring URLs. Redirect these to path routes. */
export const LEGACY_NEW_TASK_PARAM = "new_task";
export const LEGACY_TASK_PARAM = "task";

export function taskCreateHref(options?: { assignee?: string }): string {
  if (!options?.assignee) {
    return TASKS_NEW_PATH;
  }
  const params = new URLSearchParams({
    [TASK_ASSIGNEE_PARAM]: options.assignee,
  });
  return `${TASKS_NEW_PATH}?${params.toString()}`;
}

export function taskEditHref(taskId: string): string {
  return `${TASKS_PATH}/${encodeURIComponent(taskId)}`;
}

export function isTaskAuthoringRoute(pathname: string): boolean {
  return pathname === TASKS_NEW_PATH || pathname.startsWith(`${TASKS_PATH}/`);
}
