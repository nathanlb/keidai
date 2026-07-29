/** Where to load a private signing key from at boot (never from sqlite). */
export type SigningKeyMaterialSource =
  | { kind: "file"; path: string }
  | { kind: "env"; name: string };

export interface SigningKeyConfigEntry {
  kid: string;
  material: SigningKeyMaterialSource;
}

export interface SigningKeysConfig {
  /** All keys published in JWKS (one or two during rotation). */
  keys: readonly SigningKeyConfigEntry[];
  /** Kid used to sign newly minted tokens. Must be present in `keys`. */
  signingKid: string;
}
