import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@keidai/ui";
import { TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import type { OpenRouterModelOption } from "../lib/api/openrouter.js";
import { SETTINGS_PATH } from "../shell/navigation.js";
import { useOpenRouterModels } from "./hooks/use-openrouter-models.js";

/** Radix Select rejects an empty item value. */
const DEFAULT_VALUE = "__default__";

export function ModelPicker({
  value,
  onChange,
  emptyLabel,
  disabled = false,
}: {
  value: string;
  onChange: (modelId: string) => void;
  emptyLabel: string;
  disabled?: boolean;
}) {
  const { models, error, isLoading } = useOpenRouterModels();
  const selected = models.find((model) => model.id === value) ?? null;
  const unavailable =
    Boolean(value) && !isLoading && !error && selected === null;
  const closedLabel = isLoading
    ? "Loading models…"
    : value
      ? (selected?.name ?? value)
      : emptyLabel;
  const groups = groupByProvider(models);

  return (
    <div className="flex w-72 flex-col gap-2">
      <Select
        value={value || DEFAULT_VALUE}
        disabled={disabled || isLoading || Boolean(error)}
        onValueChange={(next) => onChange(next === DEFAULT_VALUE ? "" : next)}
      >
        <SelectTrigger className="w-full" aria-label="Model">
          <SelectValue>{closedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_VALUE}>{emptyLabel}</SelectItem>
          {unavailable ? <SelectItem value={value}>{value}</SelectItem> : null}
          {groups.map((group) => (
            <SelectGroup key={group.key} className="mt-1">
              <SelectLabel className="sticky top-0 z-10 -mx-1 border-y border-border bg-muted px-3 py-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
                {group.label}
              </SelectLabel>
              {group.models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  <ModelOption model={model} />
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {unavailable ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-500">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{value} is no longer available from OpenRouter.</span>
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive">
          {error.message}{" "}
          <Link to={SETTINGS_PATH} className="underline">
            Configure the OpenRouter key
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function ModelOption({ model }: { model: OpenRouterModelOption }) {
  const slug = model.id.includes("/")
    ? model.id.slice(model.id.indexOf("/") + 1)
    : null;
  const detail = slug && slug !== model.name ? slug : null;
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="truncate">{model.name}</span>
      {detail ? (
        <span className="truncate font-mono text-xs text-muted-foreground">
          {detail}
        </span>
      ) : null}
    </span>
  );
}

function groupByProvider(models: OpenRouterModelOption[]): {
  key: string;
  label: string;
  models: OpenRouterModelOption[];
}[] {
  const groups = new Map<string, OpenRouterModelOption[]>();
  for (const model of models) {
    const key = providerKey(model.id);
    const list = groups.get(key);
    if (list) {
      list.push(model);
    } else {
      groups.set(key, [model]);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, items]) => ({
      key,
      label: providerLabel(key),
      models: [...items].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    }));
}

function providerKey(id: string): string {
  const slash = id.indexOf("/");
  return slash === -1 ? "other" : id.slice(0, slash);
}

function providerLabel(key: string): string {
  if (key === "other") {
    return "Other";
  }
  return key
    .split("-")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}
