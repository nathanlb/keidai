/**
 * Operator cancelled the parked MCP task. Distinct from a retryable tool
 * error so the harness can fail the run the same way as a cancelled approval.
 */
export class TaskCancelledError extends Error {
  readonly code = "task_cancelled" as const;

  constructor(message = "cancelled by operator") {
    super(message);
    this.name = "TaskCancelledError";
  }
}
