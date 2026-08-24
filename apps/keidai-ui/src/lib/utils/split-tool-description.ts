/** Visual-line budget for a collapsed tool description on a rule row. */
export const TOOL_DESCRIPTION_PREVIEW_LINES = 2;
/** Character budget when the description is a single long paragraph. */
export const TOOL_DESCRIPTION_PREVIEW_CHARS = 160;

export function splitToolDescription(description: string): {
  preview: string;
  expandable: boolean;
} {
  const text = description.trim();
  if (!text) {
    return { preview: "", expandable: false };
  }

  const lines = text.split("\n");
  if (lines.length > TOOL_DESCRIPTION_PREVIEW_LINES) {
    return {
      preview: lines.slice(0, TOOL_DESCRIPTION_PREVIEW_LINES).join("\n").trimEnd(),
      expandable: true,
    };
  }

  if (text.length <= TOOL_DESCRIPTION_PREVIEW_CHARS) {
    return { preview: text, expandable: false };
  }

  const cut = text.slice(0, TOOL_DESCRIPTION_PREVIEW_CHARS);
  const breakAt = cut.lastIndexOf(" ");
  const preview = (breakAt > TOOL_DESCRIPTION_PREVIEW_CHARS / 2 ? cut.slice(0, breakAt) : cut).trimEnd();
  return { preview, expandable: true };
}
