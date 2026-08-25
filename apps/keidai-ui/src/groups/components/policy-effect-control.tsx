import { ToggleGroup, ToggleGroupItem, cn } from "@keidai/ui";
import { Shield } from "lucide-react";
import type { ToolEffect } from "../types/group-editor.js";

const OPTIONS: { value: ToolEffect; label: string }[] = [
  { value: "denied", label: "Deny" },
  { value: "allowed", label: "Allow" },
  { value: "gated", label: "Approval" },
];

export function PolicyEffectControl({
  value,
  onChange,
  gated = true,
}: {
  value: ToolEffect;
  onChange: (next: ToolEffect) => void;
  gated?: boolean;
}) {
  const options = gated
    ? OPTIONS
    : OPTIONS.filter((option) => option.value !== "gated");

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next === "allowed" || next === "denied" || next === "gated") {
          onChange(next);
        }
      }}
      className="h-auto shrink-0 gap-0.5 rounded-md bg-muted p-0.5"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          aria-label={option.label}
          className={cn(
            `
              h-auto min-w-0 rounded-[6px] px-2.5 py-1 text-[11.5px] font-medium
              shadow-none
            `,
            "hover:bg-transparent hover:text-foreground",
            `
              data-[state=on]:bg-card data-[state=on]:font-semibold
              data-[state=on]:text-foreground
            `,
            "data-[state=off]:text-muted-foreground",
            option.value === "gated" &&
              value === "gated" &&
              "data-[state=on]:text-amber-500",
          )}
        >
          {option.value === "gated" ? (
            <span className="inline-flex items-center gap-1">
              <Shield className="size-2.75" aria-hidden />
              {option.label}
            </span>
          ) : (
            option.label
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export function PolicyDefaultControl({
  value,
  onChange,
}: {
  value: "allow" | "deny";
  onChange: (next: "allow" | "deny") => void;
}) {
  return (
    <PolicyEffectControl
      value={value === "allow" ? "allowed" : "denied"}
      onChange={(next) => onChange(next === "allowed" ? "allow" : "deny")}
      gated={false}
    />
  );
}
