import { Button } from "@keidai/ui";
import { TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router";
import { AGENTS_PATH, GROUPS_PATH } from "../../shell/navigation.js";
import type { UndefinedGroupRef } from "../utils/collect-undefined-groups.js";
import { formatUndefinedGroupsCopy } from "../utils/format-groups-copy.js";

export function UndefinedGroupsBanner({
  refs,
}: {
  refs: readonly UndefinedGroupRef[];
}) {
  const navigate = useNavigate();
  const copy = formatUndefinedGroupsCopy(refs);
  if (!copy.defineName) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/45 bg-destructive/8 px-4 py-3.5">
      <TriangleAlert
        className="mt-0.5 size-4.25 shrink-0 text-destructive"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{copy.title}</div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {copy.body.split(copy.defineName).map((part, index, parts) => (
            <span key={`${part}-${index}`}>
              {part}
              {index < parts.length - 1 ? (
                <span className="font-mono text-foreground">
                  {copy.defineName}
                </span>
              ) : null}
            </span>
          ))}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7.5 px-2.5 text-[12.5px]"
          onClick={() =>
            navigate(`${AGENTS_PATH}?q=${encodeURIComponent(copy.defineName!)}`)
          }
        >
          See agents
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7.5 px-3 text-[12.5px]"
          onClick={() =>
            navigate(
              `${GROUPS_PATH}/new?name=${encodeURIComponent(copy.defineName!)}`,
            )
          }
        >
          Define it
        </Button>
      </div>
    </div>
  );
}
