import { useEffect, useState } from "react";

export function useTablePageIndex(resetDeps: readonly unknown[]): {
  pageIndex: number;
  onPageChange: (nextIndex: number) => void;
} {
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, resetDeps);

  return {
    pageIndex,
    onPageChange: setPageIndex,
  };
}
