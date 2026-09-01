import {
  WEEKDAYS,
  isScheduleTrigger,
  type TaskTrigger,
  type Weekday,
} from "@keidai/shared";

const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

export function formatScheduleTrigger(trigger: TaskTrigger): string {
  if (!isScheduleTrigger(trigger)) {
    return "On demand";
  }
  if (trigger.paused) {
    return "Paused";
  }
  const time = trigger.at.slice(11);
  if (!trigger.recurrence) {
    return `Once ${trigger.at.replace("T", " ")}`;
  }
  if (trigger.recurrence.freq === "daily") {
    return `Daily ${time}`;
  }
  if (trigger.recurrence.freq === "monthly") {
    return `Monthly ${time}`;
  }
  const days = WEEKDAYS.filter((day) =>
    trigger.recurrence && "days" in trigger.recurrence
      ? trigger.recurrence.days.includes(day)
      : false,
  )
    .map((day) => WEEKDAY_LABEL[day])
    .join(" ");
  return `Weekly ${days} ${time}`;
}

export function formatNextRunLabel(
  nextRunAt: string | null | undefined,
  paused: boolean,
  now: number,
  failed = false,
): string {
  if (failed) {
    return "Failed";
  }
  if (paused) {
    return "Paused";
  }
  if (!nextRunAt) {
    return "—";
  }
  const then = Date.parse(nextRunAt);
  if (Number.isNaN(then)) {
    return "—";
  }
  const delta = then - now;
  if (delta <= 0) {
    return "due";
  }
  const totalMinutes = Math.round(delta / 60_000);
  if (totalMinutes < 1) {
    return "in <1m";
  }
  if (totalMinutes < 60) {
    return `in ${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  if (hours < 48) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `in ${hours}h` : `in ${hours}h ${minutes}m`;
  }
  const days = Math.round(totalMinutes / (60 * 24));
  return `in ${days}d`;
}
