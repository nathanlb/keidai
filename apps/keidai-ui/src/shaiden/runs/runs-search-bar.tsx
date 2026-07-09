import { Input } from "@keidai/ui";
import { Search } from "lucide-react";

export function RunsSearchBar({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search by task, run id, or agent…"
        className="h-9 pl-9"
        aria-label="Search runs"
      />
    </div>
  );
}
