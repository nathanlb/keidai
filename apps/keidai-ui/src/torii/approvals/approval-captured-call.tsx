import { cn } from "@keidai/ui";
import { Braces, List } from "lucide-react";
import { useState } from "react";
import { parseNamespacedToolName } from "./utils/parse-namespaced-tool-name.js";

interface ApprovalCapturedCallProps {
  toolName: string;
  params: Record<string, unknown>;
}

function isMonoValue(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return (
    value.includes("@") ||
    /^[A-Z0-9_]+$/.test(value) ||
    value.includes("SELECT") ||
    value.startsWith("{") ||
    value.startsWith("[")
  );
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export function ApprovalCapturedCall({
  toolName,
  params,
}: ApprovalCapturedCallProps) {
  const [view, setView] = useState<"fields" | "raw">("fields");
  const { server, tool } = parseNamespacedToolName(toolName);
  const entries = Object.entries(params);

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <div>
          <div className="text-[12px] font-semibold">Captured call</div>
          <div className="text-[11px] text-muted-foreground">
            Exactly what runs on approve
          </div>
        </div>
        <div className="flex rounded-md bg-muted p-0.5">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
              view === "fields"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("fields")}
          >
            <List className="size-3" />
            Fields
          </button>
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors",
              view === "raw"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
            onClick={() => setView("raw")}
          >
            <Braces className="size-3" />
            Raw
          </button>
        </div>
      </div>

      {view === "fields" ? (
        <div>
          {entries.length === 0 ? (
            <div className="px-3 py-3 text-[13px] text-muted-foreground">
              No arguments captured.
            </div>
          ) : (
            entries.map(([key, value], index) => (
              <div
                key={key}
                className={cn(
                  "px-3 py-2.5",
                  index < entries.length - 1 && "border-b border-border",
                )}
              >
                <div className="font-mono text-[11px] text-muted-foreground">
                  {key}
                </div>
                <div
                  className={cn(
                    "mt-0.5 whitespace-pre-wrap wrap-break-word text-[13px]",
                    isMonoValue(value) ? "font-mono" : "",
                  )}
                >
                  {formatValue(value)}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap wrap-break-word border-t border-border bg-background p-3 font-mono text-[12px] leading-relaxed">
          {JSON.stringify({ server, tool, args: params }, null, 2)}
        </pre>
      )}
    </div>
  );
}
