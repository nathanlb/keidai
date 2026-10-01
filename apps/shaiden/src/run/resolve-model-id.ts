/** Task override, then the agent's default, then the platform model. */
export function resolveModelId(input: {
  taskModelId?: string;
  agentDefaultModelId?: string;
  platformModelId: string;
}): string {
  const taskModelId = input.taskModelId?.trim() ?? "";
  if (taskModelId) {
    return taskModelId;
  }
  const agentDefault = input.agentDefaultModelId?.trim() ?? "";
  if (agentDefault) {
    return agentDefault;
  }
  return input.platformModelId;
}
