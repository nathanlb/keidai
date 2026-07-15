import {
  FOLLOW_UP_MESSAGE_MAX_LENGTH,
  type FollowUpRunRequest,
} from "@keidai/shared";

export function normalizeFollowUpMessage(
  input: FollowUpRunRequest | undefined,
): string | null {
  if (!input || typeof input.message !== "string") {
    return null;
  }

  const trimmed = input.message.trim();
  if (trimmed.length === 0 || trimmed.length > FOLLOW_UP_MESSAGE_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

export function followUpConflictMessage(reason: string): string {
  switch (reason) {
    case "not_terminal":
      return "run is still active";
    case "ineligible_outcome":
      return "run outcome cannot be continued";
    case "missing_history":
      return "run has no persisted conversation history";
    case "concurrent_continuation":
      return "run continuation already in progress";
    case "lost_handle":
      return "run is not accepting follow-up messages";
    default:
      return "follow-up is not allowed for this run";
  }
}
