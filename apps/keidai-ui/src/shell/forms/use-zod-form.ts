import { zodResolver } from "@hookform/resolvers/zod";
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type UseFormProps,
  type UseFormReturn,
} from "react-hook-form";
import type { z } from "zod";

/**
 * Standard keidai-ui form setup: React Hook Form + Zod resolver.
 * Use for submit-style forms with validation; inline editors can stay local.
 */
export function useZodForm<T extends FieldValues>(
  schema: z.ZodType<T>,
  options?: Omit<UseFormProps<T>, "resolver"> & {
    defaultValues?: DefaultValues<T>;
  },
): UseFormReturn<T> {
  return useForm<T>({
    mode: "onChange",
    ...options,
    resolver: zodResolver(schema),
  });
}
