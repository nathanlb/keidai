import useSWR from "swr";
import { fetchTaskRuntime } from "../api/shaiden-client.js";

export const TASK_RUNTIME_KEY = "task-runtime";

const swrOptions = { onError: () => undefined } as const;

export function useFetchTaskRuntime() {
  const { data, error, isLoading } = useSWR(
    TASK_RUNTIME_KEY,
    fetchTaskRuntime,
    swrOptions,
  );

  return { data, error, isLoading };
}
