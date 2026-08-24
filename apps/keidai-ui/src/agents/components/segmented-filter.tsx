import { cn } from "@keidai/ui";

export interface SegmentedFilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedFilter<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedFilterOption<T>[];
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex shrink-0 gap-0.5 rounded-md bg-muted p-0.5"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] transition-colors",
              selected
                ? "bg-card font-semibold text-foreground shadow-sm"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="font-mono opacity-75">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
