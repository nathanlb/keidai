import { Button, Input, cn } from "@keidai/ui";
import { Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AddServerButton({
  servers,
  onAdd,
}: {
  servers: readonly string[];
  onAdd: (server: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  if (servers.length === 0 && !open) {
    return null;
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="h-auto justify-center gap-2 rounded-xl border border-dashed border-border bg-transparent py-3.5 text-[13px] font-normal text-muted-foreground hover:bg-accent"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
      >
        <Plus className="size-3.75" aria-hidden />
        Add a server to this group
      </Button>
    );
  }

  const matches = servers.filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="rounded-xl border border-dashed border-border p-3">
      <div className="flex h-8.5 items-center gap-2.5 rounded-md border border-ring bg-background px-2.5">
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
          placeholder="Search configured servers…"
          className="h-auto border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          aria-label="Search configured servers"
        />
        <button
          type="button"
          className="flex shrink-0 text-muted-foreground"
          onClick={() => setOpen(false)}
          aria-label="Cancel adding a server"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <div className="mt-1.5 overflow-hidden rounded-lg border border-border bg-popover">
        {matches.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-muted-foreground">
            No server matches that search.
          </div>
        ) : (
          matches.map((name) => (
            <button
              type="button"
              key={name}
              onClick={() => {
                onAdd(name);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center px-3 py-2.5 text-left font-mono text-[12.5px]",
                "hover:bg-muted/45",
              )}
            >
              {name}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
