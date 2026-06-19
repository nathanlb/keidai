import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface ResolvedCredentials {
  headers: Record<string, string>;
  /** Trace-safe credential reference — never contains secret material. */
  credentialRef?: string;
}

export const LINKING_REQUIRED_CODE = "linking_required" as const;

export interface LinkingRequiredPayload {
  code: typeof LINKING_REQUIRED_CODE;
  provider: string;
  ownerId: string;
  backend: string;
  linkUrl: string;
}

export class CredentialResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialResolutionError";
  }
}

export class LinkingRequiredError extends Error {
  readonly code = LINKING_REQUIRED_CODE;
  readonly payload: LinkingRequiredPayload;

  constructor(payload: LinkingRequiredPayload) {
    super(
      `OAuth connection required for provider "${payload.provider}" (backend "${payload.backend}")`,
    );
    this.name = "LinkingRequiredError";
    this.payload = payload;
  }
}

export function toLinkingRequiredToolResult(
  error: LinkingRequiredError,
): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: error.message }],
    structuredContent: { ...error.payload },
  };
}
