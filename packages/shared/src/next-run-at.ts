import {
  isScheduleTrigger,
  taskTriggersEqual,
  WEEKDAYS,
  type ScheduleRecurrence,
  type TaskTrigger,
  type Weekday,
} from "./task.js";

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export interface NextRunAtOptions {
  /**
   * When true, skip an occurrence that falls exactly on `fromUtc`
   * (use after a fire so the same slot cannot re-fire).
   */
  after?: boolean;
}

interface CivilDateTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function parseLocalDateTime(value: string): CivilDateTime {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) {
    throw new Error(`invalid local datetime: ${value}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(civil: CivilDateTime): string {
  return `${civil.year}-${pad2(civil.month)}-${pad2(civil.day)}T${pad2(civil.hour)}:${pad2(civil.minute)}`;
}

function partsInZone(date: Date, timeZone: string): CivilDateTime & {
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  let hour = Number(map.hour);
  if (hour === 24) {
    hour = 0;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const parts = partsInZone(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/** Convert a naive local datetime in `timeZone` to a UTC instant. */
export function zonedLocalToUtc(local: string, timeZone: string): Date {
  const civil = parseLocalDateTime(local);
  const utcGuess = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
  );
  const offset1 = offsetMs(new Date(utcGuess), timeZone);
  const instant1 = utcGuess - offset1;
  const offset2 = offsetMs(new Date(instant1), timeZone);
  return new Date(utcGuess - offset2);
}

function addUtcDays(civil: CivilDateTime, days: number): CivilDateTime {
  const date = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day + days, civil.hour, civil.minute),
  );
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOfCivilDate(civil: CivilDateTime): Weekday {
  const date = new Date(Date.UTC(civil.year, civil.month - 1, civil.day));
  return WEEKDAYS[(date.getUTCDay() + 6) % 7]!;
}

function matchesRecurrence(
  civil: CivilDateTime,
  atDay: number,
  recurrence: ScheduleRecurrence | undefined,
): boolean {
  if (!recurrence) {
    return civil.day === atDay;
  }
  if (recurrence.freq === "daily") {
    return true;
  }
  if (recurrence.freq === "weekly") {
    return recurrence.days.includes(weekdayOfCivilDate(civil));
  }
  const lastDay = daysInMonth(civil.year, civil.month);
  const targetDay = Math.min(atDay, lastDay);
  return civil.day === targetDay;
}

function isEligible(
  instant: Date,
  fromUtc: Date,
  atUtc: Date,
  after: boolean,
): boolean {
  if (instant.getTime() < atUtc.getTime()) {
    return false;
  }
  if (after) {
    return instant.getTime() > fromUtc.getTime();
  }
  return instant.getTime() >= fromUtc.getTime();
}

/**
 * First fire at or after `fromUtc` (or strictly after when `after` is set).
 * Returns null for `now`, paused schedules, and spent one-shots.
 */
export function nextRunAt(
  trigger: TaskTrigger,
  fromUtc: Date,
  options: NextRunAtOptions = {},
): Date | null {
  if (!isScheduleTrigger(trigger) || trigger.paused) {
    return null;
  }

  const after = options.after === true;
  const atCivil = parseLocalDateTime(trigger.at);
  const atUtc = zonedLocalToUtc(trigger.at, trigger.timezone);

  if (!trigger.recurrence) {
    if (!isEligible(atUtc, fromUtc, atUtc, after)) {
      return null;
    }
    return atUtc;
  }

  const fromParts = partsInZone(fromUtc, trigger.timezone);
  const startDate =
    fromUtc.getTime() < atUtc.getTime()
      ? { year: atCivil.year, month: atCivil.month, day: atCivil.day }
      : { year: fromParts.year, month: fromParts.month, day: fromParts.day };

  let cursor: CivilDateTime = {
    ...startDate,
    hour: atCivil.hour,
    minute: atCivil.minute,
  };

  for (let i = 0; i < 400; i += 1) {
    if (matchesRecurrence(cursor, atCivil.day, trigger.recurrence)) {
      const instant = zonedLocalToUtc(
        formatLocalDateTime(cursor),
        trigger.timezone,
      );
      if (isEligible(instant, fromUtc, atUtc, after)) {
        return instant;
      }
    }
    cursor = addUtcDays({ ...cursor, hour: 0, minute: 0 }, 1);
    cursor.hour = atCivil.hour;
    cursor.minute = atCivil.minute;
  }

  return null;
}

export function nextRunAtIso(
  trigger: TaskTrigger,
  fromUtc: Date,
  options: NextRunAtOptions = {},
): string | null {
  const next = nextRunAt(trigger, fromUtc, options);
  return next ? next.toISOString() : null;
}

export function oneShotMustBeFutureError(
  trigger: TaskTrigger,
  now: Date,
): string | null {
  if (!isScheduleTrigger(trigger) || trigger.paused || trigger.recurrence) {
    return null;
  }
  const at = zonedLocalToUtc(trigger.at, trigger.timezone);
  if (at.getTime() <= now.getTime()) {
    return "one-shot schedule must be in the future";
  }
  return null;
}

/**
 * Keep the stored cursor when the fire rules did not change so a goal-only
 * edit cannot skip an overdue slot or cancel a due one-shot.
 */
export function nextRunAtAfterUpdate(
  existingTrigger: TaskTrigger,
  existingNextRunAt: string | null | undefined,
  mergedTrigger: TaskTrigger,
  now: Date,
): { nextRunAt: string | null; resetScheduleState: boolean } {
  if (taskTriggersEqual(existingTrigger, mergedTrigger)) {
    return {
      nextRunAt: existingNextRunAt ?? null,
      resetScheduleState: false,
    };
  }
  return {
    nextRunAt: nextRunAtIso(mergedTrigger, now),
    resetScheduleState: true,
  };
}
