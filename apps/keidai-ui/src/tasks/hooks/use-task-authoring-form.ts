import { useFormContext } from "react-hook-form";
import type { TaskAuthoringFormValues } from "../schemas/task-authoring-form-schema.js";

export function useTaskAuthoringForm() {
  return useFormContext<TaskAuthoringFormValues>();
}
