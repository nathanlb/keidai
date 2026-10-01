import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const MIN_SECRET_KEY_LENGTH = 16;

export function hintForSecret(value: string): string {
  if (value.length <= 4) {
    return "••••";
  }
  return `…${value.slice(-4)}`;
}

export function resolveShaidenSecretKey(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const key = env.SHAIDEN_SECRET_KEY?.trim() ?? "";
  if (key.length >= MIN_SECRET_KEY_LENGTH) {
    return key;
  }
  if (
    env.NODE_ENV === "test" ||
    env.NODE_TEST_CONTEXT ||
    process.execArgv.includes("--test") ||
    process.argv.includes("--test")
  ) {
    return "shaiden-test-secret-key-do-not-use-in-production";
  }
  throw new Error(
    "SHAIDEN_SECRET_KEY is required to store the OpenRouter API key",
  );
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM. The returned token is not the plaintext. */
export function sealSecretValue(value: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(key), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function unsealSecretValue(token: string, key: string): string {
  const buf = Buffer.from(token, "base64");
  if (buf.length < 29) {
    throw new Error("Failed to decrypt stored OpenRouter API key");
  }
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(key), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Failed to decrypt stored OpenRouter API key");
  }
}
