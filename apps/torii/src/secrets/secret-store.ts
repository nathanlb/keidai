import { createHash, randomUUID } from "node:crypto";
import { EncryptJWT, jwtDecrypt, errors as joseErrors } from "jose";

export type SecretKind = "sealed" | "env_ref";

export interface StoredSecret {
  id: string;
  kind: SecretKind;
  payload: string;
  hint?: string;
  createdAt: Date;
}

export interface SecretRepository {
  get(id: string): Promise<StoredSecret | null>;
  insert(secret: StoredSecret): Promise<void>;
  delete(id: string): Promise<void>;
}

export const SECRET_REPOSITORY = Symbol("SECRET_REPOSITORY");

function deriveKey(secret: string): Uint8Array {
  return createHash("sha256").update(secret).digest();
}

export function resolveToriiSecretKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = env.TORII_SECRET_KEY?.trim();
  if (key) {
    return key;
  }
  if (
    env.NODE_ENV === "test" ||
    env.NODE_TEST_CONTEXT ||
    process.execArgv.includes("--test") ||
    process.argv.includes("--test")
  ) {
    return "torii-test-secret-key-do-not-use-in-production";
  }
  throw new Error("TORII_SECRET_KEY is required to store connector secrets");
}

export function hintForSecret(value: string): string {
  if (value.length <= 4) {
    return "••••";
  }
  return `…${value.slice(-4)}`;
}

export async function sealSecretValue(
  value: string,
  key: string,
): Promise<string> {
  return new EncryptJWT({ v: value })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .encrypt(deriveKey(key));
}

export async function unsealSecretValue(
  token: string,
  key: string,
): Promise<string> {
  const { payload } = await jwtDecrypt(token, deriveKey(key));
  const value = payload.v;
  if (typeof value !== "string") {
    throw new Error("Sealed secret payload is invalid");
  }
  return value;
}

export async function resolveSecretPayload(
  secret: StoredSecret,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  if (secret.kind === "env_ref") {
    const value = env[secret.payload];
    if (value === undefined) {
      throw new Error(`Missing environment variable: ${secret.payload}`);
    }
    return value;
  }
  try {
    return await unsealSecretValue(secret.payload, resolveToriiSecretKey(env));
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      throw new Error("Failed to decrypt stored secret");
    }
    throw error;
  }
}

export async function createSealedSecret(
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StoredSecret> {
  const key = resolveToriiSecretKey(env);
  return {
    id: randomUUID(),
    kind: "sealed",
    payload: await sealSecretValue(value, key),
    hint: hintForSecret(value),
    createdAt: new Date(),
  };
}

export function createEnvRefSecret(envName: string): StoredSecret {
  return {
    id: randomUUID(),
    kind: "env_ref",
    payload: envName,
    hint: envName,
    createdAt: new Date(),
  };
}
