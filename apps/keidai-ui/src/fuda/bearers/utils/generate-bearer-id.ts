/**
 * Generates an immutable bearer_id of the form `br_<6 hex chars>`, matching
 * the design handoff. Collision retries are left to the create API (409).
 */
export function generateBearerId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `br_${hex}`;
}
