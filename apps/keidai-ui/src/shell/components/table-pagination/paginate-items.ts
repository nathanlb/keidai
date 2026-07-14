import { TABLE_PAGE_SIZE } from "../../constants/list-limits.js";

export interface PaginatedItems<T> {
  pageItems: T[];
  shownCount: number;
  canGoNewer: boolean;
  canGoOlder: boolean;
}

export function paginateItems<T>(
  items: readonly T[],
  pageIndex: number,
  pageSize = TABLE_PAGE_SIZE,
): PaginatedItems<T> {
  const pageStart = pageIndex * pageSize;
  const pageItems = items.slice(pageStart, pageStart + pageSize);

  return {
    pageItems,
    shownCount: pageItems.length,
    canGoNewer: pageIndex > 0,
    canGoOlder: pageStart + pageSize < items.length,
  };
}
