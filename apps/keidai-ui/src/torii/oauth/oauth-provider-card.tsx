import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@keidai/ui";
import type { OAuthLinkStatus } from "@keidai/shared";
import {
  ChevronDown,
  CircleAlert,
  EyeOff,
  Key,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { OwnerAvatar } from "../agents/owner-avatar.js";
import type { OAuthProviderSummary } from "./utils/build-oauth-provider-summaries.js";
import type { OAuthProviderAggregateStatus } from "./utils/oauth-provider-config.js";

const aggregateStatusMeta: Record<
  OAuthProviderAggregateStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  linked: {
    label: "Linked",
    dotClass: "bg-success",
    badgeClass: "border-transparent bg-secondary text-secondary-foreground",
  },
  not_linked: {
    label: "Not linked",
    dotClass: "bg-muted-foreground",
    badgeClass: "border-border bg-background text-foreground",
  },
  expired: {
    label: "Expired",
    dotClass: "bg-warning",
    badgeClass: "border-border bg-background text-foreground",
  },
  misconfigured: {
    label: "Misconfigured",
    dotClass: "",
    badgeClass:
      "border-transparent bg-destructive text-destructive-foreground",
  },
};

const ownerStatusMeta: Record<
  Exclude<OAuthLinkStatus, "not_linked">,
  { label: string; dotClass: string; badgeClass: string; healthClass: string }
> = {
  linked: {
    label: "Linked",
    dotClass: "bg-success",
    badgeClass: "border-transparent bg-secondary text-secondary-foreground",
    healthClass: "text-success",
  },
  expired: {
    label: "Expired",
    dotClass: "bg-warning",
    badgeClass: "border-border bg-background text-foreground",
    healthClass: "text-warning",
  },
  pending: {
    label: "Pending",
    dotClass: "bg-muted-foreground",
    badgeClass: "border-border bg-background text-foreground",
    healthClass: "text-muted-foreground",
  },
  failed: {
    label: "Failed",
    dotClass: "",
    badgeClass:
      "border-transparent bg-destructive text-destructive-foreground",
    healthClass: "text-destructive",
  },
};

function StatusBadge({
  label,
  dotClass,
  badgeClass,
  showDot,
}: {
  label: string;
  dotClass: string;
  badgeClass: string;
  showDot: boolean;
}) {
  return (
    <Badge variant="outline" className={`gap-1.5 ${badgeClass}`}>
      {showDot ? (
        <span className={`size-1.5 rounded-full ${dotClass}`} aria-hidden />
      ) : null}
      {label}
    </Badge>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2.5 text-[12.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span title={value} className="max-w-[290px] truncate text-right font-mono">{value}</span>
    </div>
  );
}

function ClientIdIcon({ dynamic, missing }: { dynamic: boolean; missing: boolean }) {
  if (dynamic) {
    return <RefreshCw className="size-3.5 shrink-0" aria-hidden />;
  }

  if (missing) {
    return <CircleAlert className="size-3.5 shrink-0 text-destructive" aria-hidden />;
  }

  return <Key className="size-3.5 shrink-0" aria-hidden />;
}

interface OAuthProviderCardProps {
  provider: OAuthProviderSummary;
  onLink?: (providerId: string) => void;
}

export function OAuthProviderCard({ provider, onLink }: OAuthProviderCardProps) {
  const [expanded, setExpanded] = useState(false);
  const status = aggregateStatusMeta[provider.aggregateStatus];
  const dynamicClient = Boolean(provider.config.registration_endpoint);

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader
        className="grid cursor-pointer grid-cols-[minmax(0,200px)_1fr_auto_auto_auto] items-center gap-4 space-y-0 px-[18px] py-[15px] transition-colors hover:bg-muted/30 max-lg:grid-cols-1"
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-[11px]">
          <OwnerAvatar
            initials={provider.initials}
            className="size-8 rounded-lg bg-secondary text-[11px] text-secondary-foreground"
          />
          <div className="min-w-0">
            <CardTitle className="text-sm">{provider.label}</CardTitle>
            <CardDescription className="font-mono text-[11.5px]">
              {provider.id}
            </CardDescription>
          </div>
        </div>

        <div className="text-xs text-muted-foreground max-lg:hidden">
          <div className="flex items-center gap-1.5">
            <ClientIdIcon
              dynamic={dynamicClient}
              missing={provider.secretMissing}
            />
            <span>{provider.clientDisplay}</span>
          </div>
          <div className="mt-0.5 font-mono">{provider.scopesLabel}</div>
        </div>

        <div className="text-xs text-muted-foreground max-lg:hidden">
          {provider.ownersLabel}
        </div>

        <StatusBadge
          label={status.label}
          dotClass={status.dotClass}
          badgeClass={status.badgeClass}
          showDot={provider.aggregateStatus !== "misconfigured"}
        />

        <div className="flex items-center justify-self-end gap-2">
          <Button
            variant={provider.primaryVariant}
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onLink?.(provider.id);
            }}
          >
            {provider.primaryLabel}
          </Button>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </CardHeader>

      {expanded ? (
        <CardContent className="grid gap-[22px] border-t border-border px-[18px] py-4 lg:grid-cols-2">
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Provider config
            </p>
            <div className="flex flex-col gap-2">
              <DetailRow
                label="authorize_url"
                value={provider.authorizeDisplay}
              />
              <DetailRow label="token_url" value={provider.tokenDisplay} />
              <DetailRow
                label="redirect_uri"
                value={provider.redirectDisplay}
              />
              <div className="flex justify-between gap-2.5 text-[12.5px]">
                <span className="text-muted-foreground">client_secret</span>
                <span
                  className={`flex items-center gap-1.5 font-mono ${provider.secretMissing ? "text-destructive" : "text-muted-foreground"}`}
                >
                  {provider.secretMissing ? (
                    <CircleAlert className="size-3" aria-hidden />
                  ) : (
                    <EyeOff className="size-3" aria-hidden />
                  )}
                  {provider.secretLabel}
                </span>
              </div>
              <DetailRow label="pkce" value={provider.pkceLabel} />
            </div>
          </div>

          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Linked owners
              </p>
              <span className="font-mono text-[11px] text-muted-foreground">
                {provider.ownersLabel}
              </span>
            </div>

            {provider.owners.length > 0 ? (
              <div className="flex flex-col gap-2">
                {provider.owners.map((owner) => {
                  const ownerStatus = ownerStatusMeta[owner.status];

                  return (
                    <Card key={owner.ownerId} className="shadow-none">
                      <CardContent className="flex items-center gap-2.5 px-[11px] py-2.5">
                        <OwnerAvatar
                          initials={owner.initials}
                          className="size-6 text-[9px]"
                        />
                        <div className="min-w-0">
                          <div className="font-mono text-[12.5px] font-medium">
                            {owner.ownerId}
                          </div>
                          <div
                            className={`text-[11px] ${ownerStatus.healthClass}`}
                          >
                            {owner.healthLabel}
                          </div>
                        </div>
                        <div className="ml-auto">
                          <StatusBadge
                            label={ownerStatus.label}
                            dotClass={ownerStatus.dotClass}
                            badgeClass={ownerStatus.badgeClass}
                            showDot={owner.status !== "failed"}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="border-dashed shadow-none">
                <CardContent className="px-3.5 py-3.5 text-center text-[12.5px] text-muted-foreground">
                  No owner has linked this provider.
                </CardContent>
              </Card>
            )}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
