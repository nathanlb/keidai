import { defineTableColumns } from "../../shell/components/table-layout/define-table-columns.js";

export const runsTableColumns = defineTableColumns(
  {
    run: {
      width: { type: "grow", minWidth: 240 },
      headClassName: "pl-[18px]",
      cellClassName: "min-w-0 overflow-hidden py-3 pl-[18px]",
    },
    started: {
      width: { type: "fixed", width: 100 },
      cellClassName: "py-3 whitespace-nowrap",
    },
    iterations: {
      width: { type: "fixed", width: 108 },
      headClassName: "text-right",
      cellClassName: "py-3 font-mono text-right text-xs whitespace-nowrap",
    },
    duration: {
      width: { type: "fixed", width: 96 },
      headClassName: "text-right",
      cellClassName:
        "py-3 text-right font-mono text-xs text-muted-foreground whitespace-nowrap",
    },
    status: {
      width: { type: "fixed", width: 156 },
      cellClassName: "overflow-hidden py-3",
    },
    agent: {
      width: { type: "fixed", width: 172 },
      cellClassName: "min-w-0 overflow-hidden py-3",
    },
    chevron: {
      width: { type: "fixed", width: 44 },
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
