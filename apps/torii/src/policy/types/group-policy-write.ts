import type { GroupServerPolicy } from "./group-policy.js";

export interface CreateGroupPolicyInput {
  name: string;
  description: string;
  servers: GroupServerPolicy[];
}

export interface UpdateGroupPolicyInput {
  description?: string;
  servers?: GroupServerPolicy[];
}

export class GroupPolicyWriteError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GroupPolicyWriteError";
    this.statusCode = statusCode;
  }
}
