import { z } from "zod";

export const attemptVerdictSchema = z.enum(["up", "down"]);

export type AttemptVerdict = z.infer<typeof attemptVerdictSchema>;

export const ATTEMPT_VERDICT_NOTE_MAX_LENGTH = 2_000;

export const setAttemptVerdictRequestSchema = z.object({
  verdict: attemptVerdictSchema,
  note: z.string().max(ATTEMPT_VERDICT_NOTE_MAX_LENGTH).optional(),
});

export interface RunAttemptSummary {
  attemptIndex: number;
  outcome: string;
  outcomeReason: string | null;
  endedAt: string;
  verdict: AttemptVerdict | null;
  note: string | null;
  operatorId: string | null;
  verdictAt: string | null;
}

export interface RunAttemptsResponse {
  attempts: RunAttemptSummary[];
}
