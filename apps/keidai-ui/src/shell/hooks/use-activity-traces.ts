import { TRACE_SSE_EVENT, type TraceListItem } from "@keidai/shared/dto";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTraces } from "../api/gateway-client.js";

const BUFFER_LIMIT = 200;

function mergeTrace(
  current: TraceListItem[],
  trace: TraceListItem,
): TraceListItem[] {
  const without = current.filter((item) => item.traceId !== trace.traceId);
  return [trace, ...without].slice(0, BUFFER_LIMIT);
}

export function useActivityTraces(isLive: boolean) {
  const [traces, setTraces] = useState<TraceListItem[]>([]);
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const applySnapshot = useCallback((snapshot: readonly TraceListItem[]) => {
    setTraces([...snapshot]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchTraces({ limit: BUFFER_LIMIT });
        if (!cancelled) {
          applySnapshot(response.traces);
          setError(undefined);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError
              : new Error(String(loadError)),
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (!isLive) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    let cancelled = false;
    const eventSource = new EventSource("/api/traces/events");
    eventSourceRef.current = eventSource;

    const handleTraceCreated = (event: MessageEvent<string>) => {
      const trace = JSON.parse(event.data) as TraceListItem;
      setTraces((current) => mergeTrace(current, trace));
    };

    eventSource.addEventListener(
      TRACE_SSE_EVENT.traceCreated,
      handleTraceCreated,
    );

    return () => {
      cancelled = true;
      eventSource.removeEventListener(
        TRACE_SSE_EVENT.traceCreated,
        handleTraceCreated,
      );
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [isLive]);

  return { traces, bufferCount: traces.length, error, isLoading };
}
