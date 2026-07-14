import useSWR from "swr";
import { fetchTasks } from "../api/shaiden-client.js";

export const TASKS_KEY = "tasks-list";

const swrOptions = { onError: () => undefined } as const;

export function useFetchTasks() {
  const { data, error, isLoading, mutate } = useSWR(
    TASKS_KEY,
    fetchTasks,
    swrOptions,
  );

  return {
    data,
    error,
    isLoading,
    refresh: mutate,
  };
}
