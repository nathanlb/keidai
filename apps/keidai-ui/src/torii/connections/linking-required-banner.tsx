import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
} from "@keidai/ui";
import type { PublicServerConfig } from "@keidai/shared/dto";
import type { TraceListItem } from "@keidai/shared";
import { AlertTriangle, Link2 } from "lucide-react";
import {
  formatLinkProviderButtonLabel,
  formatLinkingRequiredBannerBody,
  LINKING_REQUIRED_BANNER_TITLE,
  resolveLinkProviderId,
} from "../linking/format-linking-required-prompt.js";

export interface LinkingRequiredBannerProps {
  trace: TraceListItem;
  server?: PublicServerConfig;
  onLink: (providerId: string, ownerId: string) => void;
}

export function LinkingRequiredBanner({
  trace,
  server,
  onLink,
}: LinkingRequiredBannerProps) {
  const ownerId = trace.principal?.ownerId;
  const providerId = resolveLinkProviderId(trace, server);

  if (!ownerId || !providerId) {
    return null;
  }

  return (
    <Alert variant="destructive" className="border-destructive/40 bg-destructive/8">
      <AlertTriangle aria-hidden />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <AlertTitle>{LINKING_REQUIRED_BANNER_TITLE}</AlertTitle>
          <AlertDescription className="text-[13px] leading-snug text-foreground">
            <span className="font-mono">{trace.tool}</span> for owner{" "}
            <span className="font-mono">{ownerId}</span> returned{" "}
            <span className="font-mono">linking_required</span>
            {trace.error ? (
              <>
                {": "}
                <span className="font-mono text-[12.5px]">{trace.error}</span>
              </>
            ) : (
              "."
            )}
          </AlertDescription>
          <p className="sr-only">{formatLinkingRequiredBannerBody(trace)}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="shrink-0 gap-1.5"
          onClick={() => onLink(providerId, ownerId)}
        >
          <Link2 className="size-3.5" aria-hidden />
          {formatLinkProviderButtonLabel(providerId)}
        </Button>
      </div>
    </Alert>
  );
}
