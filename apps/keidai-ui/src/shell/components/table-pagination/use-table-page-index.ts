import { useState } from "react";

function resetDepsKey(resetDeps: readonly unknown[]): string {
  return JSON.stringify(resetDeps);
}

export function useTablePageIndex(resetDeps: readonly unknown[]): {
  pageIndex: number;
  onPageChange: (nextIndex: number) => void;
} {
  const resetKey = resetDepsKey(resetDeps);
  const [pageIndex, setPageIndex] = useState(0);
  const [previousResetKey, setPreviousResetKey] = useState(resetKey);

  if (resetKey !== previousResetKey) {
    setPreviousResetKey(resetKey);
    setPageIndex(0);
  }

  return {
    pageIndex,
    onPageChange: setPageIndex,
  };
}
