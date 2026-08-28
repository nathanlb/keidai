import { getCatalogEntry } from "@keidai/shared";
import { cn } from "@keidai/ui";
import {
  siAirtable,
  siAsana,
  siAtlassian,
  siDropbox,
  siGithub,
  siGmail,
  siGoogle,
  siGooglecalendar,
  siGoogledrive,
  siHubspot,
  siLinear,
  siNotion,
  siPosthog,
  siStripe,
  siZapier,
} from "simple-icons";

type ConnectorGlyph = { title: string; path: string };

/**
 * Slack was removed from simple-icons v16 (Salesforce trademark). Path is the
 * CC0 glyph from simple-icons v15.
 */
const slackGlyph: ConnectorGlyph = {
  title: "Slack",
  path: "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
};

export const CONNECTOR_ICONS: Record<string, ConnectorGlyph> = {
  airtable: siAirtable,
  asana: siAsana,
  atlassian: siAtlassian,
  dropbox: siDropbox,
  github: siGithub,
  gmail: siGmail,
  google: siGoogle,
  googlecalendar: siGooglecalendar,
  googledrive: siGoogledrive,
  hubspot: siHubspot,
  linear: siLinear,
  notion: siNotion,
  posthog: siPosthog,
  slack: slackGlyph,
  stripe: siStripe,
  zapier: siZapier,
};

const tileClass = {
  sm: "size-7 rounded-md",
  md: "size-8 rounded-lg",
  lg: "size-9 rounded-lg",
} as const;

const glyphClass = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-4.5",
} as const;

const initialClass = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-sm",
} as const;

export type ConnectorIconSize = keyof typeof tileClass;

export function resolveConnectorGlyph(
  slug: string | undefined,
): ConnectorGlyph | undefined {
  if (!slug) {
    return undefined;
  }
  const direct = CONNECTOR_ICONS[slug];
  if (direct) {
    return direct;
  }
  const fromCatalog = getCatalogEntry(slug)?.icon;
  if (fromCatalog && fromCatalog !== slug) {
    return CONNECTOR_ICONS[fromCatalog];
  }
  return undefined;
}

export function ConnectorIcon({
  slug,
  label,
  size = "md",
  className,
}: {
  slug?: string;
  label: string;
  size?: ConnectorIconSize;
  className?: string;
}) {
  const glyph = resolveConnectorGlyph(slug);
  const initial = label.trim().slice(0, 1) || "?";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-secondary font-semibold text-secondary-foreground uppercase",
        tileClass[size],
        !glyph && initialClass[size],
        className,
      )}
      aria-hidden
    >
      {glyph ? (
        <svg viewBox="0 0 24 24" className={glyphClass[size]}>
          <path fill="currentColor" d={glyph.path} />
        </svg>
      ) : (
        initial
      )}
    </span>
  );
}
