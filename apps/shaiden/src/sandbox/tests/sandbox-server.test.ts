import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createSandboxClient } from "../sandbox-client.js";

const ISSUER = "https://fuda.test";
const SANDBOX_AUDIENCE = "shaiden-sandbox";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
publicJwk.kid = "test";
publicJwk.alg = "RS256";
publicJwk.use = "sig";
const jwksJson = JSON.stringify({ keys: [publicJwk] });

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function mintToken(audience: string, expiresInSeconds = 300): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", kid: "test", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: ISSUER,
      aud: audience,
      bearer_id: "shaiden-runner",
      iat: now,
      exp: now + expiresInSeconds,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(signingInput).sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

const sandboxToken = mintToken(SANDBOX_AUDIENCE);

const serverPath = fileURLToPath(
  new URL("../../../../shaiden-sandbox/server.py", import.meta.url),
);

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected a tcp port");
  }
  const { port } = address;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function startSandbox(): Promise<{
  baseUrl: string;
  workspace: string;
  stop: () => Promise<void>;
}> {
  const workspace = await mkdtemp(join(tmpdir(), "shaiden-sandbox-"));
  const port = await freePort();
  const child: ChildProcess = spawn("python3", [serverPath], {
    env: {
      ...process.env,
      SANDBOX_WORKSPACE_ROOT: workspace,
      SANDBOX_HOST: "127.0.0.1",
      SANDBOX_PORT: String(port),
      SANDBOX_MAX_OUTPUT_BYTES: "64",
      SANDBOX_MAX_WORKSPACE_BYTES: "128",
      SANDBOX_MAX_WORKSPACE_FILES: "4",
      SANDBOX_DEFAULT_TIMEOUT_SECONDS: "2",
      SANDBOX_MAX_TIMEOUT_SECONDS: "2",
      SANDBOX_FUDA_ISSUER: ISSUER,
      SANDBOX_FUDA_JWKS_JSON: jwksJson,
    },
    stdio: "ignore",
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 5_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      throw new Error(`sandbox exited ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  if (!ready) {
    child.kill();
    throw new Error("sandbox did not become ready");
  }
  return {
    baseUrl,
    workspace,
    stop: async () => {
      child.kill();
      await rm(workspace, { recursive: true, force: true });
    },
  };
}

describe("shaiden-sandbox server", () => {
  it("returns stdout and a non-zero exit", async () => {
    const sandbox = await startSandbox();
    try {
      const client = createSandboxClient(sandbox.baseUrl, {
        getAccessToken: async () => sandboxToken,
      });
      const ok = await client.exec("run-a", { source: "print('hello')" });
      assert.equal(ok.exitCode, 0);
      assert.equal(ok.stdout.trim(), "hello");
      assert.equal(ok.timedOut, false);

      const failed = await client.exec("run-a", { source: "raise SystemExit(3)" });
      assert.equal(failed.exitCode, 3);
    } finally {
      await sandbox.stop();
    }
  });

  it("keeps files across calls and kills a background process", async () => {
    const sandbox = await startSandbox();
    try {
      const client = createSandboxClient(sandbox.baseUrl, {
        getAccessToken: async () => sandboxToken,
      });
      await client.exec("run-a", {
        source: [
          "open('note.txt','w').write('kept')",
          "import subprocess, pathlib",
          "proc = subprocess.Popen(['sleep','30'])",
          "pathlib.Path('pid.txt').write_text(str(proc.pid))",
        ].join("\n"),
      });
      const pid = Number(
        await readFile(join(sandbox.workspace, "run-a", "pid.txt"), "utf8"),
      );
      assert.throws(() => process.kill(pid, 0));
      const second = await client.exec("run-a", {
        source: "print(open('note.txt').read())",
      });
      assert.equal(second.stdout.trim(), "kept");
      assert.equal(second.exitCode, 0);
    } finally {
      await sandbox.stop();
    }
  });

  it("times out, truncates output, and enforces the workspace cap", async () => {
    const sandbox = await startSandbox();
    try {
      const client = createSandboxClient(sandbox.baseUrl, {
        getAccessToken: async () => sandboxToken,
      });
      const timed = await client.exec("run-time", {
        source: "import time\ntime.sleep(30)\nprint('late')",
        timeoutSeconds: 1,
      });
      assert.equal(timed.timedOut, true);

      const huge = await client.exec("run-out", {
        source: "print('x' * 200)",
      });
      assert.equal(huge.truncated, true);
      assert.ok(huge.stdout.length <= 64);

      const capped = await client.exec("run-cap", {
        source: ["f0", "f1", "f2", "f3"]
          .map((name) => `open('${name}.txt','w').write('y'*40)`)
          .join("\n"),
      });
      assert.equal(capped.exitCode, 1);
      assert.match(capped.stderr, /workspace size cap exceeded/);
      await assert.rejects(() => stat(join(sandbox.workspace, "run-cap", "f0.txt")));
    } finally {
      await sandbox.stop();
    }
  });

  it("rejects a missing bearer and a Torii-audience token", async () => {
    const sandbox = await startSandbox();
    try {
      const missing = await fetch(`${sandbox.baseUrl}/runs/run-a/exec`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "print(1)" }),
      });
      assert.equal(missing.status, 401);
      await missing.text();

      const torii = await fetch(`${sandbox.baseUrl}/runs/run-a/exec`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${mintToken("torii")}`,
        },
        body: JSON.stringify({ source: "print(1)" }),
      });
      assert.equal(torii.status, 401);
      await torii.text();

      const health = await fetch(`${sandbox.baseUrl}/health`);
      assert.equal(health.status, 200);
    } finally {
      await sandbox.stop();
    }
  });

  it("stops one run from addressing another's workspace by run id", async () => {
    const sandbox = await startSandbox();
    try {
      const client = createSandboxClient(sandbox.baseUrl, {
        getAccessToken: async () => sandboxToken,
      });
      await client.exec("run-a", {
        source: "open('secret.txt','w').write('a')",
      });
      const response = await fetch(`${sandbox.baseUrl}/runs/..%2F..%2Fetc/exec`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "print(1)" }),
      });
      assert.equal(response.status, 404);
      await response.text();
      const ids = await client.listRuns();
      assert.deepEqual(ids, ["run-a"]);
      await client.deleteRun("run-a");
      assert.deepEqual(await client.listRuns(), []);
    } finally {
      await sandbox.stop();
    }
  });
});
