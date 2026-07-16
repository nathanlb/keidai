import { cn } from "@keidai/ui";
import type { CSSProperties } from "react";

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
  tableStyle: CSSProperties | undefined;
  headClassName: (key: T, extra?: string) => string;
  headStyle: (key: T) => CSSProperties | undefined;
  cellClassName: (key: T, extra?: string) => string;
  cellStyle: (key: T) => CSSProperties | undefined;
};

function widthClassName(width: TableColumnWidth): string {
  return width.type === "shrink" ? "whitespace-nowrap" : "";
}

function widthStyle(width: TableColumnWidth): CSSProperties | undefined {
  switch (width.type) {
    case "grow":
      return {
        width: "auto",
        ...(width.minWidth !== undefined ? { minWidth: width.minWidth } : {}),
      };
    case "fixed":
      return { width: width.width };
    case "percent":
      return { width: `${width.width}%` };
    case "shrink":
      // 1% + nowrap is the standard table "hug content" hint under table-fixed.
      return { width: "1%" };
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

  const tableClassName = cn("table-fixed", options.tableClassName);
  const tableStyle =
    minTableWidth !== null ? { minWidth: minTableWidth } : undefined;

  const headClassName = (key: T, extra?: string): string => {
    const column = columns[key];
    return cn(
      widthClassName(column.width),
      options.defaults?.headClassName,
      column.headClassName,
      extra,
    );
  };

  const headStyle = (key: T): CSSProperties | undefined => {
    return widthStyle(columns[key].width);
  };

  const cellClassName = (key: T, extra?: string): string => {
    const column = columns[key];
    return cn(
      widthClassName(column.width),
      options.defaults?.cellClassName,
      column.cellClassName,
      extra,
    );
  };

  const cellStyle = (key: T): CSSProperties | undefined => {
    const column = columns[key];
    const style = widthStyle(column.width);
    if (column.cellMaxWidth === undefined) {
      return style;
    }
    return { ...style, maxWidth: column.cellMaxWidth };
  };

  return {
    tableClassName,
    tableStyle,
    headClassName,
    headStyle,
    cellClassName,
    cellStyle,
  };
};
