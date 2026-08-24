import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
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
      <InputGroup className="h-9 min-w-[240px] flex-1">
        <InputGroupAddon align="inline-start">
          <InputGroupText>
            <Search aria-hidden />
          </InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Filter by tool, server, agent, owner…"
          aria-label="Filter traces"
        />
      </InputGroup>
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
