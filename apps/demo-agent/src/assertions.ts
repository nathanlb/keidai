export interface DigestToolCall {
  toolName: string;
}

export interface DigestToolResult {
  type: string;
  error?: unknown;
}

export interface DigestStep {
  toolCalls: DigestToolCall[];
  toolResults: DigestToolResult[];
}

export interface DigestResult {
  text: string;
  steps: DigestStep[];
}

const READ_TOOL_PATTERNS = [
  /^linear\.(list_issues|get_issue)/,
  /^github\.search_issues/,
  /^notion\.notion-(search|fetch)/,
  /^gmail\.send_gmail_message/,
];

export function collectToolCallNames(result: DigestResult): string[] {
  return result.steps.flatMap((step) =>
    step.toolCalls.map((toolCall) => toolCall.toolName),
  );
}

export function assertDigestToolCalls(toolNames: string[]): void {
  const requiredPatterns = [
    /^linear\./,
    /^github\./,
    /^notion\./,
    /^gmail\.send_gmail_message/,
  ];

  for (const pattern of requiredPatterns) {
    if (!toolNames.some((name) => pattern.test(name))) {
      throw new Error(
        `Expected a tool call matching ${pattern}, got: ${toolNames.join(", ") || "(none)"}`,
      );
    }
  }

  for (const name of toolNames) {
    if (!READ_TOOL_PATTERNS.some((pattern) => pattern.test(name))) {
      throw new Error(`Unexpected tool call during digest scenario: ${name}`);
    }
  }
}

export function assertDigestReportShape(text: string): void {
  for (const heading of ["## Linear", "## GitHub", "## Notion"]) {
    if (!text.includes(heading)) {
      throw new Error(`Report missing section header: ${heading}`);
    }
  }

  if (!/\bNAT-\d+\b/.test(text)) {
    throw new Error("Report missing a recognizable Linear issue id (NAT-*)");
  }
}

export function assertPolicyDeniedVisible(
  result: DigestResult,
  output: string,
): void {
  const stepErrors = result.steps.flatMap((step) =>
    step.toolResults
      .filter((toolResult) => toolResult.type === "tool-error")
      .map((toolResult) => toolResult.error),
  );

  const serialized = [
    output,
    ...stepErrors.map((error) =>
      error instanceof Error ? error.message : String(error),
    ),
  ].join("\n");

  if (!/policy_denied/i.test(serialized)) {
    throw new Error(
      `Expected policy_denied in follow-up output, got:\n${serialized}`,
    );
  }
}
