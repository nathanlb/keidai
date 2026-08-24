import { useContext } from "react";
import { ActivityTracesContext } from "./activity-traces-context.js";

export function useActivityTracesPage() {
  const value = useContext(ActivityTracesContext);
  if (!value) {
    throw new Error(
      "useActivityTracesPage must be used within ActivityTracesProvider",
    );
  }
  return value;
}
