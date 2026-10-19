import type { FastifyRequest } from "fastify";
import { readOperatorContext, type OperatorContext } from "@keidai/shared";

export function requestOperator(
  request: FastifyRequest,
): OperatorContext | null {
  return readOperatorContext(request.headers);
}
