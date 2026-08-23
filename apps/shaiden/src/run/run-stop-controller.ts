/**
 * Process-local cooperative stop for in-flight runs. HTTP `POST /stop`
 * aborts the signal; the task loop checks it at iteration boundaries and
 * after in-flight tool dispatch returns.
 */
export class RunStopController {
  private readonly requested = new Set<string>();
  private readonly controllers = new Map<string, AbortController>();

  attach(runId: string): AbortSignal {
    const existing = this.controllers.get(runId);
    if (existing) {
      return existing.signal;
    }

    const controller = new AbortController();
    this.controllers.set(runId, controller);
    if (this.requested.has(runId)) {
      controller.abort();
    }
    return controller.signal;
  }

  requestStop(runId: string): void {
    this.requested.add(runId);
    this.controllers.get(runId)?.abort();
  }

  isStopRequested(runId: string): boolean {
    return this.requested.has(runId);
  }

  release(runId: string): void {
    this.controllers.delete(runId);
    this.requested.delete(runId);
  }
}
