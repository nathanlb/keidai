export interface GatewayMcpServerHandle {
  url: string;
  close(): Promise<void>;
}

export interface GatewayMcpServerOptions {
  host?: string;
  port?: number;
}
