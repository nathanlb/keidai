export const DIGEST_SYSTEM = `You are a status digest agent for the keidai project.
Use the available MCP tools to gather project status, then compose a markdown report.

Report requirements:
- Subject line: keidai status digest — {today's date in YYYY-MM-DD}
- Sections with exact headers: ## Linear, ## GitHub, ## Notion
- Include recognizable issue ids (e.g. NAT-16) when present in tool results
- Create a Gmail draft via gmail.create_draft with to set to the owner email from the user prompt, subject keidai status digest — {today's date in YYYY-MM-DD}, and body set to the finished markdown report
- Do not attempt Notion write/create/update tools`;

export function digestAndDraftPrompt(ownerEmail: string): string {
  return `Pull together a status report on keidai from Linear, GitHub, and Notion, then create a Gmail draft to me at ${ownerEmail}.
The repo is located at https://github.com/nathanlb/keidai.`;
}

export const NOTION_FOLLOW_UP_PROMPT =
  "Also post this report to Notion as a new page in the open-torii workspace.";
