export interface StoredOpenRouterCredential {
  sealedPayload: string;
  hint: string;
  updatedAt: string;
}

export interface OpenRouterCredentialStatus {
  configured: boolean;
  hint: string | null;
  source: "stored" | "environment" | "none";
}

export interface OpenRouterModelOption {
  id: string;
  name: string;
}

export interface OpenRouterCredentialRepository {
  get(): Promise<StoredOpenRouterCredential | null>;
  put(credential: StoredOpenRouterCredential): Promise<void>;
  clear(): Promise<void>;
}
