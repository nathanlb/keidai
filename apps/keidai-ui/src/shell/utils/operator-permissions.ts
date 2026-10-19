import type { OperatorRole } from "@keidai/shared";

/** Signed-in operator. Null when a view renders without a session (unit tests). */
export interface OperatorAccess {
  ownerId: string;
  role: OperatorRole;
}

export function knownOperator(
  owner: { ownerId: string; role?: OperatorRole } | null,
): OperatorAccess | null {
  if (!owner?.role) {
    return null;
  }
  return { ownerId: owner.ownerId, role: owner.role };
}

/** Workspace-wide mutations (connectors, OpenRouter, operator roster). */
export function canMutateWorkspace(operator: OperatorAccess | null): boolean {
  if (!operator) {
    return true;
  }
  return operator.role === "admin";
}

/** Edit or delete a resource the caller owns, or any resource when admin. */
export function canMutateOwned(
  operator: OperatorAccess | null,
  resourceOwnerId: string | null | undefined,
): boolean {
  if (!operator) {
    return true;
  }
  if (operator.role === "admin") {
    return true;
  }
  return resourceOwnerId === operator.ownerId;
}

/** Creating or running a task always uses the caller's own agent. */
export function canRunOwnAgent(
  operator: OperatorAccess | null,
  agentOwnerId: string | undefined,
): boolean {
  if (!operator) {
    return true;
  }
  return agentOwnerId === operator.ownerId;
}

/** Admins may archive any task. Members only archive their own agents' tasks. */
export function canArchiveTask(
  operator: OperatorAccess | null,
  agentOwnerId: string | undefined,
): boolean {
  if (!operator) {
    return true;
  }
  if (operator.role === "admin") {
    return true;
  }
  return agentOwnerId === operator.ownerId;
}

/** Approving a tool call is owner-only, including for admins. */
export function canApproveToolCall(
  operator: OperatorAccess | null,
  approvalOwnerId: string,
): boolean {
  if (!operator) {
    return true;
  }
  return approvalOwnerId === operator.ownerId;
}

/** Reject and cancel are available to the owner and to any admin. */
export function canRejectOrCancel(
  operator: OperatorAccess | null,
  approvalOwnerId: string,
): boolean {
  if (!operator) {
    return true;
  }
  if (operator.role === "admin") {
    return true;
  }
  return approvalOwnerId === operator.ownerId;
}

export const APPROVE_OWNER_ONLY =
  "Only the owning operator can approve tool execution";
