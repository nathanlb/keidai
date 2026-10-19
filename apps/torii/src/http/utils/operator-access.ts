import type { FastifyReply, FastifyRequest } from "fastify";
import { readOperatorContext, type OperatorContext } from "@keidai/shared";

export function requestOperator(
  request: FastifyRequest,
): OperatorContext | null {
  return readOperatorContext(request.headers);
}

/** 403 when a signed-in member calls an admin-only route. Internal callers pass. */
export function forbidUnlessAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): boolean {
  const operator = requestOperator(request);
  if (operator && operator.role !== "admin") {
    reply.code(403).send({ error: "Forbidden" });
    return true;
  }
  return false;
}
