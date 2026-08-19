import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { SignJWT, type JWK, type JWTPayload } from "jose";
import type { SigningKeysConfig } from "./types/signing-key-config.js";
import { loadSigningKeyMaterial } from "./utils/load-signing-key-material.js";

const SIGNING_ALG = "RS256";

export interface SignJwtOptions {
  issuer: string;
  audience: string;
  expiresInSeconds: number;
  /** Extra registered/private claims merged into the payload. */
  claims?: JWTPayload;
}

export interface JwksDocument {
  keys: JWK[];
}

interface LoadedKey {
  kid: string;
  privateKey: KeyObject;
  publicJwk: JWK;
}

/**
 * Boot-loaded signing authority: private keys stay out of the database; public
 * halves are published via JWKS. Supports two active keys for rotation
 * (publish → sign → retire).
 */
export class SigningKeyService {
  private readonly keysByKid: Map<string, LoadedKey>;
  private readonly signingKid: string;
  private readonly jwks: JwksDocument;

  constructor(
    config: SigningKeysConfig,
    env: NodeJS.ProcessEnv = process.env,
    cwd: string = process.cwd(),
  ) {
    const loaded: LoadedKey[] = [];

    for (const entry of config.keys) {
      const pem = loadSigningKeyMaterial(entry.material, env, cwd);
      let privateKey: KeyObject;
      try {
        privateKey = createPrivateKey(pem);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Invalid private key for kid "${entry.kid}": ${reason}`,
        );
      }

      if (privateKey.asymmetricKeyType !== "rsa") {
        throw new Error(
          `Signing key kid "${entry.kid}" must be RSA (RS256); got ${privateKey.asymmetricKeyType ?? "unknown"}`,
        );
      }

      const publicJwk = createPublicKey(privateKey).export({
        format: "jwk",
      }) as JWK;
      publicJwk.kid = entry.kid;
      publicJwk.alg = SIGNING_ALG;
      publicJwk.use = "sig";

      loaded.push({ kid: entry.kid, privateKey, publicJwk });
    }

    if (!loaded.some((key) => key.kid === config.signingKid)) {
      throw new Error(
        `FUDA_SIGNING_KID "${config.signingKid}" is not among loaded keys`,
      );
    }

    this.keysByKid = new Map(loaded.map((key) => [key.kid, key]));
    this.signingKid = config.signingKid;
    this.jwks = { keys: loaded.map((key) => key.publicJwk) };
  }

  getSigningKid(): string {
    return this.signingKid;
  }

  /** Public JWKS document for all active (published) keys. */
  getJwks(): JwksDocument {
    return this.jwks;
  }

  /**
   * Mints a JWT signed with the current signing key. Always sets `kid` in
   * the protected header so verifiers can select the right JWKS entry.
   */
  async signJwt(options: SignJwtOptions): Promise<string> {
    const key = this.keysByKid.get(this.signingKid);
    if (!key) {
      throw new Error(`Signing key kid "${this.signingKid}" is not loaded`);
    }

    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ ...(options.claims ?? {}) })
      .setProtectedHeader({ alg: SIGNING_ALG, kid: key.kid })
      .setIssuer(options.issuer)
      .setAudience(options.audience)
      .setIssuedAt(now)
      .setExpirationTime(now + options.expiresInSeconds)
      .sign(key.privateKey);
  }
}
