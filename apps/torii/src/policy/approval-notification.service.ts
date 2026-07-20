import {
  APPROVAL_DECIDED_NOTIFICATION_METHOD,
  type ApprovalDecidedNotificationStatus,
  type ApprovalRecordStatus,
} from "@keidai/shared";
import type { Logger } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { McpSessionRegistry } from "../mcp/mcp-session-registry.service.js";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";

interface ApprovalDecisionNotificationInput {
  id: string;
  mcpSessionId?: string;
  status: ApprovalRecordStatus;
  rejectionReason?: string;
}

@injectable()
export class ApprovalNotificationService {
  constructor(
    @inject(McpSessionRegistry)
    private readonly sessionRegistry: McpSessionRegistry,
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {}

  notifyDecision(record: ApprovalDecisionNotificationInput): void {
    if (!record.mcpSessionId) {
      return;
    }
    if (
      record.status !== "approved" &&
      record.status !== "rejected" &&
      record.status !== "cancelled"
    ) {
      return;
    }
    const status: ApprovalDecidedNotificationStatus = record.status;

    const session = this.sessionRegistry.get(record.mcpSessionId);
    if (!session) {
      this.logger.info("mcp.approval_notification", {
        approvalId: record.id,
        sessionId: record.mcpSessionId,
        status: record.status,
        delivered: false,
      });
      return;
    }

    void session.transport
      .send({
        jsonrpc: "2.0",
        method: APPROVAL_DECIDED_NOTIFICATION_METHOD,
        params: {
          approval_id: record.id,
          status,
          ...(record.rejectionReason
            ? { reason: record.rejectionReason }
            : {}),
        },
      })
      .then(() => {
        this.logger.info("mcp.approval_notification", {
          approvalId: record.id,
          sessionId: record.mcpSessionId,
          status: record.status,
          delivered: true,
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "notification send failed";
        this.logger.error("mcp.approval_notification", {
          approvalId: record.id,
          sessionId: record.mcpSessionId,
          status: record.status,
          delivered: false,
          error: message,
        });
      });
  }
}
