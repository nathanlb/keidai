import { useParams, useSearchParams } from "react-router";
import { TASK_ASSIGNEE_PARAM } from "../navigation.js";
import { TaskAuthoringView } from "../task-authoring-view.js";

export function TaskAuthoringPage() {
  const { taskId } = useParams<{ taskId?: string }>();
  const [searchParams] = useSearchParams();
  const defaultAssignee = searchParams.get(TASK_ASSIGNEE_PARAM) ?? undefined;

  return (
    <TaskAuthoringView taskId={taskId} defaultAssignee={defaultAssignee} />
  );
}
