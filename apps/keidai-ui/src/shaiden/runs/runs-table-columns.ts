import { defineTableColumns } from "../../shell/components/table-layout/define-table-columns.js";

export const runsTableColumns = defineTableColumns(
  {
    run: {
      width: { type: "percent", width: 28 },
      headClassName: "pl-[18px]",
      cellClassName: "max-w-0 py-3",
    },
    started: {
      width: { type: "percent", width: 14 },
      cellClassName: "min-w-0 py-3",
    },
    iterations: {
      width: { type: "percent", width: 9 },
      headClassName: "text-right",
      cellClassName: "min-w-0 py-3 font-mono text-right text-xs",
    },
    duration: {
      width: { type: "percent", width: 9 },
      headClassName: "text-right",
      cellClassName:
        "min-w-0 py-3 text-right font-mono text-xs text-muted-foreground",
    },
    status: {
      width: { type: "percent", width: 14 },
      cellClassName: "min-w-0 overflow-hidden py-3",
    },
    agent: {
      width: { type: "percent", width: 16 },
      cellClassName: "max-w-0 py-3",
    },
    chevron: {
      width: { type: "shrink" },
      headClassName: "pr-[18px]",
      cellClassName: "py-3 pl-2 pr-[18px] text-right",
    },
  },
  {
    defaults: {
      headClassName: "h-auto py-2.5 text-xs font-medium",
    },
  },
);
