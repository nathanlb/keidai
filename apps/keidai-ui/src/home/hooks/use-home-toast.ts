import { useCallback, useEffect, useRef, useState } from "react";

const TOAST_DURATION_MS = 2600;

export function useHomeToast() {
  const [message, setMessage] = useState<string | null>(null);
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

  useEffect(() => clear, [clear]);

  return { message, showToast };
}
