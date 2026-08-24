import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@keidai/ui";
import { Search } from "lucide-react";

export function RunsSearchBar({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <InputGroup className="h-9">
      <InputGroupAddon align="inline-start">
        <InputGroupText>
          <Search aria-hidden />
        </InputGroupText>
      </InputGroupAddon>
      <InputGroupInput
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search by task, run id, or agent…"
        aria-label="Search runs"
      />
    </InputGroup>
  );
}
