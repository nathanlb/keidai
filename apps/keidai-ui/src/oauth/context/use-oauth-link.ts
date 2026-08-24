import { useContext } from "react";
import { OAuthLinkContext } from "./oauth-link-context.js";

export function useOAuthLink() {
  const value = useContext(OAuthLinkContext);
  if (!value) {
    throw new Error("useOAuthLink must be used within OAuthLinkProvider");
  }
  return value;
}
