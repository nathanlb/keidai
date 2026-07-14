import { cn } from "@keidai/ui";

export type TableColumnWidth =
  | { type: "grow"; minWidth?: number }
  | { type: "fixed"; width: number }
  | { type: "percent"; width: number }
  | { type: "shrink" };

export type TableColumnSpec = {
  width: TableColumnWidth;
  headClassName?: string;
  cellClassName?: string;
  cellMaxWidth?: number;
};

export type DefineTableColumnsOptions = {
  defaults?: {
    headClassName?: string;
    cellClassName?: string;
  };
  tableClassName?: string;
};

export type TableColumnsLayout<T extends string> = {
  tableClassName: string;
  headClassName: (key: T, extra?: string) => string;
  cellClassName: (key: T, extra?: string) => string;
};

function widthClassName(width: TableColumnWidth): string {
  switch (width.type) {
    case "grow":
      return width.minWidth !== undefined ? `min-w-[${width.minWidth}px]` : "";
    case "fixed":
      return `w-[${width.width}px]`;
    case "percent":
      return `w-[${width.width}%]`;
    case "shrink":
      return "w-0 whitespace-nowrap";
  }
}

function computeMinTableWidth(columns: readonly TableColumnSpec[]): number | null {
  let sum = 0;
  let hasPixelConstraints = false;

  for (const column of columns) {
    if (column.width.type === "fixed") {
      sum += column.width.width;
      hasPixelConstraints = true;
    } else if (
      column.width.type === "grow" &&
      column.width.minWidth !== undefined
    ) {
      sum += column.width.minWidth;
      hasPixelConstraints = true;
    }
  }

  return hasPixelConstraints ? sum : null;
}

export function defineTableColumns<T extends string>(
  columns: Record<T, TableColumnSpec>,
  options: DefineTableColumnsOptions = {},
): TableColumnsLayout<T> {
  const columnList = Object.values(columns) as TableColumnSpec[];
  const minTableWidth = computeMinTableWidth(columnList);

  const tableClassName = cn(
    "table-fixed",
    minTableWidth !== null && `min-w-[${minTableWidth}px]`,
    options.tableClassName,
  );

  const headClassName = (key: T, extra?: string): string => {
    const column = columns[key];
    return cn(
      widthClassName(column.width),
      options.defaults?.headClassName,
      column.headClassName,
      extra,
    );
  };

  const cellClassName = (key: T, extra?: string): string => {
    const column = columns[key];
    return cn(
      widthClassName(column.width),
      column.cellMaxWidth !== undefined && `max-w-[${column.cellMaxWidth}px]`,
      options.defaults?.cellClassName,
      column.cellClassName,
      extra,
    );
  };

  return {
    tableClassName,
    headClassName,
    cellClassName,
  };
}
