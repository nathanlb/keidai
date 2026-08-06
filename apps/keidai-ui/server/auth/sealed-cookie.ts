import { createHash } from "node:crypto";
import { EncryptJWT, jwtDecrypt, errors as joseErrors } from "jose";

function deriveKey(secret: string): Uint8Array {
  return createHash("sha256").update(secret).digest();
}

export async function sealPayload(
  payload: Record<string, unknown>,
  secret: string,
  maxAgeSeconds: number,
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(deriveKey(secret));
}

export async function unsealPayload<T extends Record<string, unknown>>(
  token: string,
  secret: string,
): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(token, deriveKey(secret));
    return payload as unknown as T;
  } catch (error) {
    if (
      error instanceof joseErrors.JOSEError ||
      error instanceof TypeError
    ) {
      return null;
    }
    throw error;
  }
}
