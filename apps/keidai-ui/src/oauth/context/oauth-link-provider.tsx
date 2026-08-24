import { useMemo, type ReactNode } from "react";
import { OAuthLinkDialog } from "../oauth-link-dialog.js";
import { useOAuthLinkDialog } from "../hooks/use-oauth-link-dialog.js";
import {
  OAuthLinkContext,
  type OAuthLinkContextValue,
} from "./oauth-link-context.js";

interface OAuthLinkProviderProps {
  children: ReactNode;
}

export function OAuthLinkProvider({ children }: OAuthLinkProviderProps) {
  const linkDialog = useOAuthLinkDialog();

  const value = useMemo<OAuthLinkContextValue>(
    () => ({
      openLink: linkDialog.openLink,
    }),
    [linkDialog.openLink],
  );

  return (
    <OAuthLinkContext.Provider value={value}>
      {children}
      <OAuthLinkDialog
        open={linkDialog.open}
        step={linkDialog.step}
        context={linkDialog.context}
        errorMessage={linkDialog.errorMessage}
        isSubmitting={linkDialog.isSubmitting}
        onClose={linkDialog.close}
        onBeginAuthorization={linkDialog.beginAuthorization}
        onReopenAuthorization={linkDialog.reopenAuthorization}
        onConfirmFinished={linkDialog.confirmFinished}
        onRetry={linkDialog.retry}
      />
    </OAuthLinkContext.Provider>
  );
}
