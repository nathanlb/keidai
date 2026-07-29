/** True when Node's sqlite driver raised a UNIQUE constraint failure. */
export function isSqliteUniqueConstraintError(
  error: unknown,
  columnHint?: string,
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (!/UNIQUE constraint failed/i.test(error.message)) {
    return false;
  }
  if (columnHint === undefined) {
    return true;
  }
  return error.message.includes(columnHint);
}

/** True when Node's sqlite driver raised a FOREIGN KEY constraint failure. */
export function isSqliteForeignKeyError(error: unknown): boolean {
  return (
    error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message)
  );
}
