import { z } from "zod";

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Sync validation for agent create. Slug uniqueness is checked async separately. */
export const createAgentFormSchema = z.object({
  name: z.string(),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(
      slugPattern,
      "Use lowercase letters, numbers, and single dashes only.",
    ),
  groups: z.array(z.string().min(1)),
  persona: z.string().min(1, "Persona is required"),
});

export type CreateAgentFormValues = z.infer<typeof createAgentFormSchema>;
