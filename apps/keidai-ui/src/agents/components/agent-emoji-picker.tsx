import { isSingleEmoji } from "@keidai/shared";
import {
  Button,
  cn,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@keidai/ui";
import { SmilePlus } from "lucide-react";
import { useState } from "react";

const SUGGESTED_EMOJI = [
  ..."🤖 🧠 🦊 🦉 🐙 🐝 🦄 🐢".split(" "),
  ..."📰 📬 📝 📊 📅 🔍 🧾 🗂️".split(" "),
  ..."🛠️ ⚙️ 🧪 🔒 🚀 ⚡ 🔥 🌱".split(" "),
  ..."💬 🎯 🧭 🛰️ 💡 🎨 🎧 🏗️".split(" "),
];

export function AgentEmojiPicker({
  value,
  fallback,
  onChange,
}: {
  value: string;
  /** Initials shown on the trigger while no emoji is chosen. */
  fallback: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const trimmedCustom = custom.trim();
  const customValid = isSingleEmoji(trimmedCustom);

  function choose(emoji: string) {
    onChange(emoji);
    setCustom("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={value ? `Agent emoji ${value}` : "Choose agent emoji"}
          className="size-9.5 shrink-0 p-0 text-xl"
        >
          {value || (
            <span className="text-xs font-medium text-muted-foreground">
              {fallback || <SmilePlus className="size-4" aria-hidden />}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <div className="grid grid-cols-8 gap-1">
          {SUGGESTED_EMOJI.map((emoji) => (
            <Button
              key={emoji}
              type="button"
              variant="ghost"
              aria-label={emoji}
              aria-pressed={emoji === value}
              onClick={() => choose(emoji)}
              className={cn(
                "size-8 p-0 text-lg",
                emoji === value && "bg-accent",
              )}
            >
              {emoji}
            </Button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (customValid) {
                  choose(trimmedCustom);
                }
              }
            }}
            placeholder="Paste any emoji"
            aria-label="Custom emoji"
            className="h-8 flex-1 text-sm"
          />
          <Button
            type="button"
            size="sm"
            disabled={!customValid}
            onClick={() => choose(trimmedCustom)}
          >
            Use
          </Button>
        </div>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-muted-foreground"
            onClick={() => choose("")}
          >
            Use initials instead
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
