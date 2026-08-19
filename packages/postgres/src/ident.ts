const IDENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Quote a SQL identifier. Rejects names that are not simple idents. */
export function quoteIdent(name: string): string {
  if (!IDENT_PATTERN.test(name)) {
    throw new Error(`invalid SQL identifier: ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}
