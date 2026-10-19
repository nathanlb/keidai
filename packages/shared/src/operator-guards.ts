import { readOperatorContext } from "./operator-context.js";

export interface GuardRequest {
  headers: Parameters<typeof readOperatorContext>[0];
}

export interface GuardReply {
  code(statusCode: number): {
    send(payload: unknown): unknown;
  };
}

/** Returns true to continue, false after it has already sent the denial. */
export type OperatorGuard = (
  this: unknown,
  request: GuardRequest,
  reply: GuardReply,
) => boolean | Promise<boolean>;

/**
 * Runs guards before the method. The first guard that returns false stops the
 * call; that guard is responsible for sending the response.
 */
export function UseGuards(...guards: OperatorGuard[]): MethodDecorator {
  return (_target, _propertyKey, descriptor) => {
    const original = descriptor.value;
    if (typeof original !== "function") {
      return descriptor;
    }
    descriptor.value = async function (
      this: unknown,
      request: GuardRequest,
      reply: GuardReply,
    ) {
      for (const guard of guards) {
        if (!(await guard.call(this, request, reply))) {
          return;
        }
      }
      return original.call(this, request, reply);
    } as typeof original;
    return descriptor;
  };
}

/**
 * 403 when a signed-in member calls an admin-only route.
 * Missing operator context is allowed so internal callers keep working.
 */
export function AdminOnly(): MethodDecorator {
  return UseGuards(function adminOnly(request, reply) {
    const operator = readOperatorContext(request.headers);
    if (operator && operator.role !== "admin") {
      reply.code(403).send({ error: "Forbidden" });
      return false;
    }
    return true;
  });
}
