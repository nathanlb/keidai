import { z } from "zod";

const EMOJI_PATTERN =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * True when `value` is exactly one emoji grapheme. ZWJ sequences, skin tones,
 * flags, and keycaps count as one.
 */
export function isSingleEmoji(value: string): boolean {
  const segments = [...graphemes.segment(value)];
  return segments.length === 1 && EMOJI_PATTERN.test(value);
}

/** Single emoji that represents an agent in operator surfaces. */
export const agentEmojiSchema = z
  .string()
  .trim()
  .max(32)
  .refine(isSingleEmoji, "expected a single emoji");
