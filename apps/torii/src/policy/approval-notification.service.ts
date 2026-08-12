import type { ApprovalRecordStatus } from "@keidai/shared";
import type { Logger } from "@keidai/shared";
import { inject, injectable } from "tsyringe";
import { StructuredLoggerService } from "../logging/structured-logger.service.js";

interface ApprovalDecisionNotificationInput {
  id: string;
  mcpSessionId?: string;
  status: ApprovalRecordStatus;
  rejectionReason?: string;
}

/**
 * Approval decision wakeups used to push over the stateful MCP GET stream.
 * Protocol 2026-07-28 removed that transport; Tasks (NAT-146 / NAT-148) will
 * replace it. Until then decisions are recorded in the ledger only — clients
 * that still need a wakeup must poll or wait for the Tasks migration.
 */
@injectable()
export class ApprovalNotificationService {
  constructor(
    @inject(StructuredLoggerService)
    private readonly logger: Logger,
  ) {}

  notifyDecision(record: ApprovalDecisionNotificationInput): void {
    if (
      record.status !== "approved" &&
      record.status !== "rejected" &&
      record.status !== "cancelled"
    ) {
      return;
    }

    this.logger.info("mcp.approval_notification", {
      approvalId: record.id,
      status: record.status,
      delivered: false,
      reason: "stateless_protocol_no_push_path",
    });
  }
}
