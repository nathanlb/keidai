import { createContext } from "react";
import type {
  OAuthLinkDialogContext,
  OAuthLinkCompletedHandler,
  OpenOAuthLinkOptions,
} from "../hooks/use-oauth-link-dialog.js";

export interface OAuthLinkContextValue {
  openLink: (
    context: OAuthLinkDialogContext,
    options?: OpenOAuthLinkOptions,
  ) => void;
}

export const OAuthLinkContext = createContext<OAuthLinkContextValue | null>(
  null,
);

export type { OAuthLinkCompletedHandler, OpenOAuthLinkOptions };
