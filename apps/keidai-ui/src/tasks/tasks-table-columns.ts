import { defineTableColumns } from "../shell/components/table-layout/define-table-columns.js";

export const tasksTableColumns = defineTableColumns({
  goal: {
    width: { type: "grow", minWidth: 150 },
    headClassName: "pl-4.5",
    cellClassName: "overflow-hidden py-3 pl-4.5",
  },
  assignee: {
    width: { type: "fixed", width: 200 },
    cellClassName: "overflow-hidden py-3",
  },
  updated: {
    width: { type: "fixed", width: 150 },
    cellClassName:
      "py-3 whitespace-nowrap font-mono text-[12.5px] text-muted-foreground",
  },
  actions: {
    width: { type: "fixed", width: 170 },
    headClassName: "pr-[18px] text-right whitespace-nowrap",
    cellClassName: "py-3 pr-[18px] text-right whitespace-nowrap",
  },
});
