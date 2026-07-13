export type PendingOAuthLinkStatus = "pending" | "completed" | "failed";

export interface PendingOAuthLink {
  linkId: string;
  ownerId: string;
  provider: string;
  codeVerifier?: string;
  redirectUri: string;
  uiOrigin?: string;
  status: PendingOAuthLinkStatus;
  error?: string;
  createdAt: Date;
}
