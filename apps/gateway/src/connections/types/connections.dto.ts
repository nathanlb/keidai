export type PublicConnectionState = "connecting" | "connected" | "failed";

export interface PublicConnectionStatus {
  name: string;
  state: PublicConnectionState;
  error?: string;
}

export interface ConnectionsResponse {
  connections: PublicConnectionStatus[];
}

export interface ConnectionStateChangedEvent {
  type: "connection_state_changed";
  connection: PublicConnectionStatus;
}
