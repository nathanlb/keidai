import { Navigate } from "react-router-dom";
import { NEW_TASK_HREF } from "../navigation.js";

/** Deep-link entry: redirects to Runs with the new-task dialog open. */
export function TasksPage() {
  return <Navigate to={NEW_TASK_HREF} replace />;
}
