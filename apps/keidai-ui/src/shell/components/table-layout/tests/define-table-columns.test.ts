import { describe, expect, it } from "vitest";
import { defineTableColumns } from "../define-table-columns.js";

describe("defineTableColumns", () => {
  it("sums pixel constraints into table min-width style", () => {
    const layout = defineTableColumns({
      goal: { width: { type: "grow", minWidth: 150 } },
      assignee: { width: { type: "fixed", width: 200 } },
      updated: { width: { type: "fixed", width: 150 } },
      actions: { width: { type: "fixed", width: 170 } },
    });

    expect(layout.tableClassName).toBe("table-fixed");
    expect(layout.tableStyle).toEqual({ minWidth: 670 });
  });

  it("omits table min-width for percent-only tables", () => {
    const layout = defineTableColumns({
      run: { width: { type: "percent", width: 28 } },
      started: { width: { type: "percent", width: 14 } },
    });

    expect(layout.tableClassName).toBe("table-fixed");
    expect(layout.tableStyle).toBeUndefined();
  });

  it("maps width types to shared head and cell styles", () => {
    const layout = defineTableColumns({
      goal: { width: { type: "grow", minWidth: 150 }, headClassName: "pl-[18px]" },
      assignee: { width: { type: "fixed", width: 200 } },
      chevron: { width: { type: "percent", width: 10 } },
      actions: { width: { type: "shrink" } },
    });

    expect(layout.headClassName("goal")).toBe("pl-[18px]");
    expect(layout.headStyle("goal")).toEqual({ width: "auto", minWidth: 150 });
    expect(layout.cellStyle("assignee")).toEqual({ width: 200 });
    expect(layout.headStyle("chevron")).toEqual({ width: "10%" });
    expect(layout.cellClassName("actions")).toBe("whitespace-nowrap");
    expect(layout.cellStyle("actions")).toEqual({ width: "1%" });
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
      "h-auto py-2.5 text-xs font-medium pl-[18px] extra-head",
    );
    expect(layout.headStyle("run")).toEqual({ width: "28%" });
    expect(layout.cellClassName("run", "extra-cell")).toBe(
      "align-top py-3 extra-cell",
    );
  });

  it("applies optional cell max-width", () => {
    const layout = defineTableColumns({
      endpoint: {
        width: { type: "grow" },
        cellMaxWidth: 220,
      },
    });

    expect(layout.cellStyle("endpoint")).toEqual({ width: "auto", maxWidth: 220 });
  });

  it("supports mixed percent and shrink columns in one table", () => {
    const layout = defineTableColumns({
      run: { width: { type: "percent", width: 28 } },
      chevron: { width: { type: "shrink" } },
    });

    expect(layout.tableClassName).toBe("table-fixed");
    expect(layout.headStyle("run")).toEqual({ width: "28%" });
    expect(layout.cellStyle("chevron")).toEqual({ width: "1%" });
  });

  it("supports mixed percent and fixed columns in one table", () => {
    const layout = defineTableColumns({
      run: { width: { type: "percent", width: 28 } },
      chevron: { width: { type: "fixed", width: 44 } },
    });

    expect(layout.tableStyle).toEqual({ minWidth: 44 });
    expect(layout.headStyle("run")).toEqual({ width: "28%" });
    expect(layout.cellStyle("chevron")).toEqual({ width: 44 });
  });

  it("merges optional table class names", () => {
    const layout = defineTableColumns(
      {
        goal: { width: { type: "grow", minWidth: 100 } },
      },
      { tableClassName: "custom-table" },
    );

    expect(layout.tableClassName).toBe("table-fixed custom-table");
    expect(layout.tableStyle).toEqual({ minWidth: 100 });
  });
});
