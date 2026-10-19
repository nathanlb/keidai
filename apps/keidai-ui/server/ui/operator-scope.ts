import type { ApprovalRecordView, OperatorContext } from "@keidai/shared";
import type { FastifyRequest } from "fastify";

export interface AgentOwnerRef {
  id: string;
  ownerId?: string;
}

export interface RunOwnerRef {
  assignee: string;
  agentOwnerId?: string;
}

export function requestOperator(
  request: FastifyRequest,
): OperatorContext | null {
  const principal = request.operatorPrincipal;
  if (!principal) {
    return null;
  }
  return { ownerId: principal.ownerId, role: principal.role };
}

/**
 * Members see a run when its stamped agent owner matches, or, for runs that
 * predate that stamp, when the assignee agent belongs to them.
 */
export function runVisibleToMember(
  run: RunOwnerRef,
  agents: readonly AgentOwnerRef[],
  ownerId: string,
): boolean {
  if (run.agentOwnerId) {
    return run.agentOwnerId === ownerId;
  }
  return agents.find((agent) => agent.id === run.assignee)?.ownerId === ownerId;
}

export function runsVisibleToOperator<T extends RunOwnerRef>(
  runs: readonly T[],
  agents: readonly AgentOwnerRef[],
  operator: OperatorContext | null,
): T[] {
  if (!operator || operator.role === "admin") {
    return [...runs];
  }
  return runs.filter((run) =>
    runVisibleToMember(run, agents, operator.ownerId),
  );
}

export function approvalsVisibleToOperator<
  T extends Pick<ApprovalRecordView, "ownerId">,
>(approvals: readonly T[], operator: OperatorContext | null): T[] {
  if (!operator || operator.role === "admin") {
    return [...approvals];
  }
  return approvals.filter((approval) => approval.ownerId === operator.ownerId);
}
