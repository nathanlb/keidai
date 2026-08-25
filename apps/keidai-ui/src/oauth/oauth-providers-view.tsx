import { KeyRound } from "lucide-react";
import { PageEmptyState } from "../shell/components/page-content/page-empty-state.js";
import type { OAuthProviderSummary } from "./utils/build-oauth-provider-summaries.js";
import { OAuthProviderCard } from "./oauth-provider-card.js";

function OAuthProvidersEmptyState() {
  return (
    <PageEmptyState
      icon={<KeyRound className="size-7.5" aria-hidden />}
      title="No OAuth providers configured"
      description={
        <>
          Configure a provider such as GitHub, Google, or Slack to enable{" "}
          <span className="font-mono">user_oauth</span> credential resolution.
          Grants are stored per{" "}
          <span className="font-mono">(owner, provider)</span> pair.
        </>
      }
    />
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
