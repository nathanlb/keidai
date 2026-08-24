import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 2600;

/** Shows a message for ~2.6s. Passing an `initialMessage` also auto-dismisses it. */
export function useAgentsToast(initialMessage: string | null = null) {
  const [message, setMessage] = useState<string | null>(initialMessage);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const showToast = useCallback(
    (next: string) => {
      clear();
      setMessage(next);
      timeoutRef.current = setTimeout(() => {
        setMessage(null);
      }, TOAST_DURATION_MS);
    },
    [clear],
  );

  // Only re-arms the auto-dismiss for the message present on mount.
  useEffect(() => {
    if (initialMessage) {
      timeoutRef.current = setTimeout(() => {
        setMessage(null);
      }, TOAST_DURATION_MS);
    }
    return clear;
  }, []);

  return { message, showToast };
}
