import { Button, Input, cn } from "@keidai/ui";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CatalogueTool, ToolEffect } from "../types/group-editor.js";
import { filterCatalogueTools } from "../utils/list-explicit-rules.js";
import {
  formatPickerEmpty,
  formatUnruledCount,
} from "../utils/format-groups-copy.js";

export function AddToolRule({
  unruled,
  addsAs,
  disabled,
  disabledReason,
  onAdd,
}: {
  unruled: readonly CatalogueTool[];
  addsAs: ToolEffect;
  disabled?: boolean;
  disabledReason?: string;
  onAdd: (tool: CatalogueTool) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (disabled) {
    return (
      <p className="text-[12.5px] text-muted-foreground">{disabledReason}</p>
    );
  }

  if (!open) {
    const remaining = formatUnruledCount(unruled.length);
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-8 justify-start gap-2 rounded-md border border-dashed border-border bg-transparent px-2.5 text-[12.5px] font-normal text-muted-foreground hover:bg-accent"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        <Plus className="size-3.5" aria-hidden />
        Add a tool rule
        {remaining ? (
          <span className="font-mono text-[11px]">{remaining}</span>
        ) : null}
      </Button>
    );
  }

  const matches = filterCatalogueTools(unruled, query);
  const addsLabel = addsAs === "denied" ? "Deny" : "Allow";

  return (
    <div>
      <div className="flex h-8.5 items-center gap-2.5 rounded-md border border-ring bg-background px-2.5 shadow-[0_0_0_3px_color-mix(in_srgb,var(--ring)_30%,transparent)]">
        <Search
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOpen(false);
            }
          }}
          placeholder="Search this server's tools…"
          className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          aria-label="Search this server's tools"
        />
        <button
          type="button"
          className="flex shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(false)}
          aria-label="Cancel adding a tool rule"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="mt-1.5 max-h-53 overflow-y-auto rounded-lg border border-border bg-popover shadow-[0_10px_34px_rgba(0,0,0,.45)]">
        {matches.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-muted-foreground">
            {formatPickerEmpty(unruled.length)}
          </div>
        ) : (
          matches.map((tool) => (
            <button
              type="button"
              key={tool.name}
              onClick={() => {
                onAdd(tool);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-b-0",
                "hover:bg-muted/45",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[12.5px] font-medium">
                  {tool.name}
                </div>
                {tool.description ? (
                  <div className="mt-px truncate text-[11px] text-muted-foreground">
                    {tool.description}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                adds as {addsLabel}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
