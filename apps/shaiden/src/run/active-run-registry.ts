import type { ConversationEntry } from "./types/conversation-history.js";

export interface ActiveRunHandle {
  runId: string;
  queueUserMessageIfWaiting(text: string): boolean;
  drainPendingUserMessages(): ConversationEntry[];
  setWaitingForApproval(waiting: boolean): void;
}

export class ActiveRunRegistry {
  private readonly handles = new Map<string, ActiveRunHandle>();

  register(handle: ActiveRunHandle): () => void {
    this.handles.set(handle.runId, handle);
    return () => {
      if (this.handles.get(handle.runId) === handle) {
        this.handles.delete(handle.runId);
      }
    };
  }

  get(runId: string): ActiveRunHandle | undefined {
    return this.handles.get(runId);
  }

  queueUserMessageIfWaiting(
    runId: string,
    text: string,
  ): boolean {
    const handle = this.handles.get(runId);
    if (!handle) {
      return false;
    }
    return handle.queueUserMessageIfWaiting(text);
  }
}

export function createActiveRunHandle(runId: string): ActiveRunHandle {
  const pendingUserMessages: ConversationEntry[] = [];
  let waitingForApproval = false;

  return {
    runId,
    queueUserMessageIfWaiting(text: string): boolean {
      if (!waitingForApproval) {
        return false;
      }
      pendingUserMessages.push({ role: "user", text });
      return true;
    },
    drainPendingUserMessages(): ConversationEntry[] {
      if (pendingUserMessages.length === 0) {
        return [];
      }
      const drained = [...pendingUserMessages];
      pendingUserMessages.length = 0;
      return drained;
    },
    setWaitingForApproval(waiting: boolean): void {
      waitingForApproval = waiting;
    },
  };
}
