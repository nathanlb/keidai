export interface ShaidenHttpServerHandle {
  /** Base URL for REST endpoints, e.g. http://127.0.0.1:3200 */
  baseUrl: string;
  close(): Promise<void>;
}

export interface ShaidenHttpServerOptions {
  host?: string;
  port?: number;
}
