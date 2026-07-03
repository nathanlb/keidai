import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@keidai/ui";
import { Search } from "lucide-react";

export function ActivityFilterBar({
  query,
  server,
  serverOptions,
  onQueryChange,
  onServerChange,
}: {
  query: string;
  server: string;
  serverOptions: readonly string[];
  onQueryChange: (query: string) => void;
  onServerChange: (server: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="relative min-w-[240px] flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filter by tool, server, agent, owner…"
          className="h-9 pl-9"
          aria-label="Filter traces"
        />
      </div>
      <Select value={server} onValueChange={onServerChange}>
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue placeholder="All servers" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All servers</SelectItem>
          {serverOptions.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
