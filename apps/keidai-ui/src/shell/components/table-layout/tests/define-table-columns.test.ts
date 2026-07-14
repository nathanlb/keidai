import { describe, expect, it } from "vitest";
import { defineTableColumns } from "../define-table-columns.js";

describe("defineTableColumns", () => {
  it("sums pixel constraints into table min-width", () => {
    const layout = defineTableColumns({
      goal: { width: { type: "grow", minWidth: 150 } },
      assignee: { width: { type: "fixed", width: 200 } },
      updated: { width: { type: "fixed", width: 150 } },
      actions: { width: { type: "fixed", width: 170 } },
    });

    expect(layout.tableClassName).toContain("table-fixed");
    expect(layout.tableClassName).toContain("min-w-[670px]");
  });

  it("omits table min-width for percent-only tables", () => {
    const layout = defineTableColumns({
      run: { width: { type: "percent", width: 28 } },
      started: { width: { type: "percent", width: 14 } },
    });

    expect(layout.tableClassName).toBe("table-fixed");
    expect(layout.tableClassName).not.toContain("min-w-[");
  });

  it("maps width types to shared head and cell classes", () => {
    const layout = defineTableColumns({
      goal: { width: { type: "grow", minWidth: 150 }, headClassName: "pl-[18px]" },
      assignee: { width: { type: "fixed", width: 200 } },
      chevron: { width: { type: "percent", width: 10 } },
      actions: { width: { type: "shrink" } },
    });

    expect(layout.headClassName("goal")).toBe("min-w-[150px] pl-[18px]");
    expect(layout.cellClassName("assignee")).toBe("w-[200px]");
    expect(layout.headClassName("chevron")).toBe("w-[10%]");
    expect(layout.cellClassName("actions")).toBe("w-0 whitespace-nowrap");
  });

  it("merges defaults, per-column classes, and per-call extras", () => {
    const layout = defineTableColumns(
      {
        run: {
          width: { type: "percent", width: 28 },
          headClassName: "pl-[18px]",
          cellClassName: "py-3",
        },
      },
      {
        defaults: {
          headClassName: "h-auto py-2.5 text-xs font-medium",
          cellClassName: "align-top",
        },
      },
    );

    expect(layout.headClassName("run", "extra-head")).toBe(
      "w-[28%] h-auto py-2.5 text-xs font-medium pl-[18px] extra-head",
    );
    expect(layout.cellClassName("run", "extra-cell")).toBe(
      "w-[28%] align-top py-3 extra-cell",
    );
  });

  it("applies optional cell max-width", () => {
    const layout = defineTableColumns({
      endpoint: {
        width: { type: "grow" },
        cellMaxWidth: 220,
      },
    });

    expect(layout.cellClassName("endpoint")).toBe("max-w-[220px]");
  });

  it("supports mixed percent and shrink columns in one table", () => {
    const layout = defineTableColumns({
      run: { width: { type: "percent", width: 28 } },
      chevron: { width: { type: "shrink" } },
    });

    expect(layout.tableClassName).toBe("table-fixed");
    expect(layout.headClassName("run")).toBe("w-[28%]");
    expect(layout.cellClassName("chevron")).toBe("w-0 whitespace-nowrap");
  });

  it("supports mixed percent and fixed columns in one table", () => {
    const layout = defineTableColumns({
      run: { width: { type: "percent", width: 28 } },
      chevron: { width: { type: "fixed", width: 44 } },
    });

    expect(layout.tableClassName).toBe("table-fixed min-w-[44px]");
    expect(layout.headClassName("run")).toBe("w-[28%]");
    expect(layout.cellClassName("chevron")).toBe("w-[44px]");
  });

  it("merges optional table class names", () => {
    const layout = defineTableColumns(
      {
        goal: { width: { type: "grow", minWidth: 100 } },
      },
      { tableClassName: "custom-table" },
    );

    expect(layout.tableClassName).toBe(
      "table-fixed min-w-[100px] custom-table",
    );
  });
});
