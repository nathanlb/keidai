export interface FudaHttpServerOptions {
  host?: string;
  port?: number;
}

export interface FudaHttpServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}
