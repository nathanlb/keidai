import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Writes an RSA PKCS#8 PEM private key (mode 0600) and returns its path. */
export function writeTempSigningKeyPem(kid: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `fuda-key-${kid}-`));
  const keyPath = path.join(dir, `${kid}.pem`);
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(
    keyPath,
    privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    { mode: 0o600 },
  );
  return keyPath;
}
