/** Live connection state for a configured MCP server. */
export type ConnectionState = "connecting" | "connected" | "failed";

export interface ConnectionStatus {
  name: string;
  state: ConnectionState;
  error?: string;
  /** Namespaced tools exposed for this server after catalog refresh; omitted when unknown. */
  toolCount?: number;
}

/** Response body for `GET /api/connections`. */
export interface ConnectionsResponse {
  connections: ConnectionStatus[];
}

/** SSE `event:` names on `GET /api/connections/events`. */
export const CONNECTION_SSE_EVENT = {
  stateChanged: "connection_state_changed",
} as const;

export type ConnectionSseEventType =
  (typeof CONNECTION_SSE_EVENT)[keyof typeof CONNECTION_SSE_EVENT];

/**
 * Parsed SSE event from the connections event stream.
 * The `event:` line is `type`; the `data:` line is JSON for `connection`.
 */
export type ConnectionSseEvent = {
  type: typeof CONNECTION_SSE_EVENT.stateChanged;
  connection: ConnectionStatus;
};

/** Wire-format `data:` payload keyed by SSE event name. */
export interface ConnectionSseEventData {
  [CONNECTION_SSE_EVENT.stateChanged]: ConnectionStatus;
}
