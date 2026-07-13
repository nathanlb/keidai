import {
  CONNECTION_SSE_EVENT,
  type ConnectionStatus,
} from "@keidai/shared/dto";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchConnections } from "../../torii/api/torii-client.js";

function toConnectionMap(
  connections: readonly ConnectionStatus[],
): Map<string, ConnectionStatus> {
  return new Map(connections.map((connection) => [connection.name, connection]));
}

export function useLiveConnections() {
  const [connections, setConnections] = useState<Map<string, ConnectionStatus>>(
    new Map(),
  );
  const [error, setError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const applySnapshot = useCallback((snapshot: readonly ConnectionStatus[]) => {
    setConnections(toConnectionMap(snapshot));
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchConnections();
        if (!cancelled) {
          applySnapshot(response.connections);
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

    const eventSource = new EventSource("/api/connections/events");
    eventSourceRef.current = eventSource;

    const handleStateChanged = (event: MessageEvent<string>) => {
      const connection = JSON.parse(event.data) as ConnectionStatus;
      setConnections((current) => {
        const next = new Map(current);
        next.set(connection.name, connection);
        return next;
      });
    };

    eventSource.addEventListener(
      CONNECTION_SSE_EVENT.stateChanged,
      handleStateChanged,
    );
    eventSource.onerror = () => {
      if (!cancelled) {
        setError(new Error("Connection event stream interrupted"));
      }
    };

    return () => {
      cancelled = true;
      eventSource.removeEventListener(
        CONNECTION_SSE_EVENT.stateChanged,
        handleStateChanged,
      );
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [applySnapshot]);

  return { connections, error, isLoading };
}
