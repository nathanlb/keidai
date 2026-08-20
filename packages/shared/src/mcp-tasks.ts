import { z } from "zod";

/**
 * MCP Tasks extension (`io.modelcontextprotocol/tasks`) types and Zod schemas,
 * vendored from the draft schema in https://github.com/modelcontextprotocol/ext-tasks.
 *
 * There is no published TypeScript runtime package for this extension (unlike
 * `@modelcontextprotocol/ext-apps`). Track upstream in case one appears.
 *
 * Prefixed `Mcp*` so these do not collide with Shaiden's `Task` domain type.
 */

export const MCP_TASKS_EXTENSION_ID = "io.modelcontextprotocol/tasks" as const;

export const MCP_TASKS_GET_METHOD = "tasks/get" as const;
export const MCP_TASKS_UPDATE_METHOD = "tasks/update" as const;
export const MCP_TASKS_CANCEL_METHOD = "tasks/cancel" as const;
export const MCP_SUBSCRIPTIONS_LISTEN_METHOD = "subscriptions/listen" as const;
export const MCP_TASKS_NOTIFICATION_METHOD = "notifications/tasks" as const;
export const MCP_SUBSCRIPTIONS_ACKNOWLEDGED_METHOD =
  "notifications/subscriptions/acknowledged" as const;
export const MCP_SUBSCRIPTION_ID_META_KEY =
  "io.modelcontextprotocol/subscriptionId" as const;

export const MCP_TASKS_METHODS = [
  MCP_TASKS_GET_METHOD,
  MCP_TASKS_UPDATE_METHOD,
  MCP_TASKS_CANCEL_METHOD,
] as const;

export type McpTasksMethod = (typeof MCP_TASKS_METHODS)[number];

export const MCP_CREATE_TASK_RESULT_TYPE = "task" as const;
export const MCP_COMPLETE_RESULT_TYPE = "complete" as const;
/** MRTR interim result (`InputRequiredResult`), distinct from task status. */
export const MCP_INPUT_REQUIRED_RESULT_TYPE = "input_required" as const;

export const mcpTaskStatusSchema = z.enum([
  "working",
  "input_required",
  "completed",
  "failed",
  "cancelled",
]);

export type McpTaskStatus = z.infer<typeof mcpTaskStatusSchema>;

export const MCP_TASK_TERMINAL_STATUSES = [
  "completed",
  "failed",
  "cancelled",
] as const satisfies readonly McpTaskStatus[];

export type McpTaskTerminalStatus = (typeof MCP_TASK_TERMINAL_STATUSES)[number];

const mcpTaskFieldsSchema = z.object({
  taskId: z.string().min(1),
  statusMessage: z.string().optional(),
  createdAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime(),
  ttlMs: z.number().int().nullable(),
  pollIntervalMs: z.number().int().nonnegative().optional(),
});

export const mcpTaskSchema = mcpTaskFieldsSchema.extend({
  status: mcpTaskStatusSchema,
});

export type McpTask = z.infer<typeof mcpTaskSchema>;

/** Outstanding server-to-client requests keyed for `tasks/update`. */
export const mcpInputRequestsSchema = z.record(z.unknown());
export type McpInputRequests = z.infer<typeof mcpInputRequestsSchema>;

/** Client responses keyed to outstanding `inputRequests`. */
export const mcpInputResponsesSchema = z.record(z.unknown());
export type McpInputResponses = z.infer<typeof mcpInputResponsesSchema>;

export const mcpWorkingTaskSchema = mcpTaskFieldsSchema.extend({
  status: z.literal("working"),
});
export type McpWorkingTask = z.infer<typeof mcpWorkingTaskSchema>;

export const mcpInputRequiredTaskSchema = mcpTaskFieldsSchema.extend({
  status: z.literal("input_required"),
  inputRequests: mcpInputRequestsSchema,
});
export type McpInputRequiredTask = z.infer<typeof mcpInputRequiredTaskSchema>;

export const mcpCompletedTaskSchema = mcpTaskFieldsSchema.extend({
  status: z.literal("completed"),
  result: z.record(z.unknown()),
});
export type McpCompletedTask = z.infer<typeof mcpCompletedTaskSchema>;

export const mcpFailedTaskSchema = mcpTaskFieldsSchema.extend({
  status: z.literal("failed"),
  error: z.record(z.unknown()),
});
export type McpFailedTask = z.infer<typeof mcpFailedTaskSchema>;

export const mcpCancelledTaskSchema = mcpTaskFieldsSchema.extend({
  status: z.literal("cancelled"),
});
export type McpCancelledTask = z.infer<typeof mcpCancelledTaskSchema>;

export const mcpDetailedTaskSchema = z.discriminatedUnion("status", [
  mcpWorkingTaskSchema,
  mcpInputRequiredTaskSchema,
  mcpCompletedTaskSchema,
  mcpFailedTaskSchema,
  mcpCancelledTaskSchema,
]);

export type McpDetailedTask = z.infer<typeof mcpDetailedTaskSchema>;

/** `Result & Task` (flat). Servers MUST set `resultType` to `"task"`. */
export const mcpCreateTaskResultSchema = mcpTaskSchema.extend({
  resultType: z.literal(MCP_CREATE_TASK_RESULT_TYPE),
});
export type McpCreateTaskResult = z.infer<typeof mcpCreateTaskResultSchema>;

/** `tasks/get` result. `resultType` MUST be `"complete"`. */
export const mcpGetTaskResultSchema = z.intersection(
  z.object({ resultType: z.literal(MCP_COMPLETE_RESULT_TYPE) }),
  mcpDetailedTaskSchema,
);
export type McpGetTaskResult = z.infer<typeof mcpGetTaskResultSchema>;

export const mcpGetTaskParamsSchema = z.object({
  taskId: z.string().min(1),
});
export type McpGetTaskParams = z.infer<typeof mcpGetTaskParamsSchema>;

export const mcpUpdateTaskParamsSchema = z.object({
  taskId: z.string().min(1),
  inputResponses: mcpInputResponsesSchema,
});
export type McpUpdateTaskParams = z.infer<typeof mcpUpdateTaskParamsSchema>;

export const mcpCancelTaskParamsSchema = z.object({
  taskId: z.string().min(1),
});
export type McpCancelTaskParams = z.infer<typeof mcpCancelTaskParamsSchema>;

/**
 * `subscriptions/listen` filter for this extension. Other listen fields are
 * ignored; omitting `taskIds` means the client did not opt into task push.
 */
export const mcpTaskSubscriptionFilterSchema = z.object({
  taskIds: z.array(z.string().min(1)).optional(),
});
export type McpTaskSubscriptionFilter = z.infer<
  typeof mcpTaskSubscriptionFilterSchema
>;

/**
 * Task IDs the client asked to cover, or `undefined` when the listen filter
 * did not opt into `notifications/tasks`.
 */
export function readRequestedTaskIds(params: unknown): string[] | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const notifications = (params as { notifications?: unknown }).notifications;
  if (!notifications || typeof notifications !== "object") {
    return undefined;
  }
  if (
    !Object.prototype.hasOwnProperty.call(notifications, "taskIds")
  ) {
    return undefined;
  }
  const taskIds = (notifications as { taskIds?: unknown }).taskIds;
  if (!Array.isArray(taskIds)) {
    return [];
  }
  return taskIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

export const mcpTasksExtensionCapabilitySchema = z.object({}).strict();
export type McpTasksExtensionCapability = z.infer<
  typeof mcpTasksExtensionCapabilitySchema
>;

export function isMcpTasksMethod(method: string): method is McpTasksMethod {
  return (MCP_TASKS_METHODS as readonly string[]).includes(method);
}

export function isMcpTaskTerminalStatus(
  status: McpTaskStatus,
): status is McpTaskTerminalStatus {
  return (MCP_TASK_TERMINAL_STATUSES as readonly string[]).includes(status);
}

/**
 * Per-request client capability check. Presence of the extension key is
 * enough; the spec currently defines no settings (empty object = support).
 */
export function clientDeclaresTasksExtension(
  clientCapabilities: unknown,
): boolean {
  if (clientCapabilities === null || typeof clientCapabilities !== "object") {
    return false;
  }
  const extensions = (clientCapabilities as { extensions?: unknown })
    .extensions;
  if (extensions === null || typeof extensions !== "object") {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(
    extensions,
    MCP_TASKS_EXTENSION_ID,
  );
}

export function toCreateTaskResult(task: McpTask): McpCreateTaskResult {
  return {
    resultType: MCP_CREATE_TASK_RESULT_TYPE,
    ...task,
  };
}

export function toGetTaskResult(task: McpDetailedTask): McpGetTaskResult {
  return {
    resultType: MCP_COMPLETE_RESULT_TYPE,
    ...task,
  };
}
