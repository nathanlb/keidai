import { Button, cn } from "@keidai/ui";
import { useState } from "react";
import { splitToolDescription } from "../utils/split-tool-description.js";

export function ToolDescription({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const { preview, expandable } = splitToolDescription(text);
  const [expanded, setExpanded] = useState(false);

  if (!text.trim()) {
    return null;
  }

  const collapsed = expandable && !expanded;
  const shown = collapsed ? preview : text.trim();
  const ellipsis =
    collapsed && !preview.includes("\n") && shown.length < text.trim().length;

  return (
    <div
      className={cn(
        "mt-0.5 min-w-0 text-[11.5px] leading-snug text-muted-foreground",
        className,
      )}
    >
      <p className="whitespace-pre-wrap">
        {shown}
        {ellipsis ? "…" : null}
      </p>
      {expandable ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-0.5 h-auto px-0 py-0 text-[11px] font-medium text-foreground/80 hover:bg-transparent hover:text-foreground"
          aria-expanded={expanded}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      ) : null}
    </div>
  );
}
