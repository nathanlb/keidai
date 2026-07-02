import { Card, CardContent } from "@keidai/ui";
import { KeyRound, Shield } from "lucide-react";
import type { OAuthProviderSummary } from "./utils/build-oauth-provider-summaries.js";
import { OAuthProviderCard } from "./oauth-provider-card.js";

function PrivacyBanner() {
  return (
    <div className="mb-4 grid grid-cols-[auto_1fr] items-center gap-x-3 rounded-lg border border-border px-4 py-3 text-muted-foreground">
      <Shield className="size-4" aria-hidden />
      <p className="text-sm leading-snug">
        For security, saved client secrets and access tokens are masked. Grants are stored per <span className="font-mono">(owner, provider)</span>.
      </p>
    </div>
  );
}

function OAuthProvidersEmptyState() {
  return (
    <Card className="shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-[60px] text-center">
        <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted/55 text-muted-foreground">
          <KeyRound className="size-[30px]" aria-hidden />
        </span>
        <div className="mt-4 text-base font-semibold">
          No OAuth providers configured
        </div>
        <p className="mt-1.5 max-w-[380px] text-[13px] leading-normal text-muted-foreground">
          Configure a provider such as GitHub, Google, or Slack to enable{" "}
          <span className="font-mono">user_oauth</span> credential resolution.
          Grants are stored per{" "}
          <span className="font-mono">(owner, provider)</span> pair.
        </p>
      </CardContent>
    </Card>
  );
}

export interface OAuthProvidersViewProps {
  providers: OAuthProviderSummary[];
  onLinkProvider?: (providerId: string) => void;
}

export function OAuthProvidersView({
  providers,
  onLinkProvider,
}: OAuthProvidersViewProps) {
  const isEmpty = providers.length === 0;

  return (
    <>
      <PrivacyBanner />
      {isEmpty ? (
        <OAuthProvidersEmptyState />
      ) : (
        <div className="space-y-3">
          {providers.map((provider) => (
            <OAuthProviderCard
              key={provider.id}
              provider={provider}
              onLink={onLinkProvider}
            />
          ))}
        </div>
      )}
    </>
  );
}
