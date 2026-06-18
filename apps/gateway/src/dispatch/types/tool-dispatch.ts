export class ToolNotFoundError extends Error {
  constructor(toolName: string) {
    super(`Unknown tool: ${toolName}`);
    this.name = "ToolNotFoundError";
  }
}

export class BackendUnavailableError extends Error {
  constructor(server: string, reason: string) {
    super(`Backend "${server}" is unavailable: ${reason}`);
    this.name = "BackendUnavailableError";
  }
}
