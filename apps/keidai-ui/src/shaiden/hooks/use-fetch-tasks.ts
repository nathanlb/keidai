import useSWR from "swr";
import { LIST_BUFFER_LIMIT } from "../../shell/constants/list-limits.js";
import { fetchTasks } from "../api/shaiden-client.js";

export const TASKS_KEY = "tasks-list";

const swrOptions = { onError: () => undefined } as const;

export function useFetchTasks() {
  const { data, error, isLoading, mutate } = useSWR(
    TASKS_KEY,
    () => fetchTasks({ limit: LIST_BUFFER_LIMIT }),
    swrOptions,
  );

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  };
}
