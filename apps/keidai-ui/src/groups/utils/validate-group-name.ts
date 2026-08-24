const NAME_PATTERN = /^[a-z][a-z0-9._-]*$/;

export function validateGroupName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "Name is required.";
  }
  if (trimmed === "new") {
    return "Choose a different name — “new” is reserved.";
  }
  if (!NAME_PATTERN.test(trimmed)) {
    return "Use a lowercase identifier: start with a letter, then letters, numbers, dots, dashes, or underscores.";
  }
  return null;
}
