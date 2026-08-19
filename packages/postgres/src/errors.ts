import pg from "pg";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export function isUniqueViolation(
  error: unknown,
  constraintHint?: string,
): boolean {
  if (!(error instanceof pg.DatabaseError) && !isPgError(error)) {
    return false;
  }
  if (error.code !== UNIQUE_VIOLATION) {
    return false;
  }
  if (constraintHint === undefined) {
    return true;
  }
  const haystack = `${error.constraint ?? ""} ${error.detail ?? ""} ${error.message}`;
  return haystack.includes(constraintHint);
}

export function isForeignKeyViolation(error: unknown): boolean {
  return isPgError(error) && error.code === FOREIGN_KEY_VIOLATION;
}

function isPgError(
  error: unknown,
): error is { code?: string; constraint?: string; detail?: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error
  );
}
