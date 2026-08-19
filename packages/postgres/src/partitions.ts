import { quoteIdent } from "./ident.js";
import type { Queryable } from "./pool.js";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the ISO week containing `at`. */
export function utcWeekStart(at: Date): Date {
  const dayStart = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()),
  );
  const day = dayStart.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  dayStart.setUTCDate(dayStart.getUTCDate() + mondayOffset);
  return dayStart;
}

export function addWeeks(weekStart: Date, weeks: number): Date {
  return new Date(weekStart.getTime() + weeks * MS_PER_WEEK);
}

export function partitionName(table: string, weekStart: Date): string {
  return `${table}_p${weekStart.toISOString().slice(0, 10).replaceAll("-", "")}`;
}

function isoLiteral(value: Date): string {
  return `'${value.toISOString()}'`;
}

export async function ensureWeeklyPartitions(
  queryable: Queryable,
  table: string,
  around: Date,
  weeksAhead = 1,
): Promise<void> {
  const start = utcWeekStart(around);
  for (let week = 0; week <= weeksAhead; week += 1) {
    const from = addWeeks(start, week);
    const to = addWeeks(from, 1);
    const name = partitionName(table, from);
    await queryable.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(name)}
      PARTITION OF ${quoteIdent(table)}
      FOR VALUES FROM (${isoLiteral(from)}) TO (${isoLiteral(to)})
    `);
  }
}

export async function dropWeeklyPartitionsOlderThan(
  queryable: Queryable,
  table: string,
  cutoff: Date,
): Promise<string[]> {
  const oldestKept = utcWeekStart(cutoff);
  const result = await queryable.query<{ relname: string }>(
    `
      SELECT c.relname
      FROM pg_class c
      JOIN pg_inherits i ON i.inhrelid = c.oid
      JOIN pg_class p ON p.oid = i.inhparent
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE p.relname = $1
        AND n.nspname = current_schema()
        AND c.relkind = 'r'
        AND c.relispartition
    `,
    [table],
  );

  const dropped: string[] = [];
  for (const row of result.rows) {
    const match = /_p(\d{8})$/.exec(row.relname);
    if (!match?.[1]) {
      continue;
    }
    const raw = match[1];
    const start = new Date(
      `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T00:00:00.000Z`,
    );
    if (start < oldestKept) {
      await queryable.query(`DROP TABLE IF EXISTS ${quoteIdent(row.relname)}`);
      dropped.push(row.relname);
    }
  }
  return dropped;
}

export function defaultPartitionRetentionMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.KEIDAI_PARTITION_RETENTION_DAYS?.trim();
  if (!raw) {
    return 7 * 24 * 60 * 60 * 1000;
  }
  const days = Number(raw);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error("KEIDAI_PARTITION_RETENTION_DAYS must be a positive number");
  }
  return days * 24 * 60 * 60 * 1000;
}
