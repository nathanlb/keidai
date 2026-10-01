import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { generateKeyPairSync, createSign } from "node:crypto";
import { promisify } from "node:util";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const ISSUER = "https://fuda.test";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const publicJwk = publicKey.export({ format: "jwk" }) as Record<string, string>;
publicJwk.kid = "test";
publicJwk.alg = "RS256";
publicJwk.use = "sig";

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function mintToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(
    JSON.stringify({ alg: "RS256", kid: "test", typ: "JWT" }),
  );
  const payload = b64url(
    JSON.stringify({
      iss: ISSUER,
      aud: "shaiden-sandbox",
      bearer_id: "shaiden-runner",
      iat: now,
      exp: now + 300,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(privateKey)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

const exec = promisify(execFile);
const dockerfile = fileURLToPath(
  new URL("../../../../shaiden-sandbox/Dockerfile", import.meta.url),
);
const context = fileURLToPath(new URL("../../../../../", import.meta.url));
const image = "keidai-shaiden-sandbox:test";
const container = "keidai-shaiden-sandbox-test";

const token = mintToken();
const probe = `
import json, urllib.request
TOKEN = ${JSON.stringify(token)}
def post(run_id, source):
    body = json.dumps({"source": source, "timeoutSeconds": 10}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:8080/runs/{run_id}/exec",
        data=body,
        method="POST",
        headers={"Authorization": "Bearer " + TOKEN},
    )
    with urllib.request.urlopen(req) as response:
        return json.load(response)
post("run-a", "open('secret.txt','w').write('hidden')")
denied = post("run-b", "print(open('/workspaces/run-a/secret.txt').read())")
offline = post(
    "run-c",
    "import urllib.request\\nurllib.request.urlopen('http://example.com', timeout=3)\\nprint('reached')",
)
api = post(
    "run-d",
    "import urllib.request\\n"
    "urllib.request.urlopen('http://127.0.0.1:8080/runs', timeout=3)\\n"
    "print('reached-api')",
)
shared = post(
    "run-e",
    "open('/tmp/sandbox-cross','w').write('leak')\\n"
    "open('/dev/shm/sandbox-cross','w').write('leak')\\n"
    "print('wrote-shared')",
)
v6 = post(
    "run-f",
    "import urllib.request\\n"
    "urllib.request.urlopen('http://[::1]:9', timeout=3)\\n"
    "print('reached-v6')",
)
unix = post(
    "run-g",
    "import socket\\n"
    "socket.socket(socket.AF_UNIX, socket.SOCK_STREAM).bind('\\0keidai')\\n"
    "print('bound-unix')",
)
print(json.dumps({"denied": denied, "offline": offline, "api": api, "shared": shared, "v6": v6, "unix": unix}))
`;

describe("shaiden-sandbox image", () => {
  it("isolates workspaces by uid and blocks outbound network", async () => {
    await exec("docker", ["build", "-f", dockerfile, "-t", image, context]);
    await exec("docker", ["rm", "-f", container]).catch(() => {});
    await exec("docker", [
      "run",
      "-d",
      "--name",
      container,
      "--cap-drop=ALL",
      "--cap-add=SETUID",
      "--cap-add=SETGID",
      "--cap-add=CHOWN",
      "--cap-add=FOWNER",
      "--cap-add=DAC_OVERRIDE",
      "--cap-add=NET_ADMIN",
      "--security-opt=no-new-privileges",
      "--read-only",
      "--tmpfs=/tmp",
      "--tmpfs=/workspaces",
      "--pids-limit=64",
      "--memory=256m",
      "-e",
      `SANDBOX_FUDA_ISSUER=${ISSUER}`,
      "-e",
      `SANDBOX_FUDA_JWKS_JSON=${JSON.stringify({ keys: [publicJwk] })}`,
      image,
    ]);
    try {
      const deadline = Date.now() + 15_000;
      let ready = false;
      while (Date.now() < deadline) {
        try {
          await exec("docker", [
            "exec",
            container,
            "python",
            "-c",
            "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health')",
          ]);
          ready = true;
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      assert.equal(ready, true);
      const { stdout } = await exec("docker", [
        "exec",
        container,
        "python",
        "-c",
        probe,
      ]);
      const body = JSON.parse(stdout) as {
        denied: { exitCode: number; stderr: string };
        offline: { exitCode: number; stderr: string; stdout: string };
        api: { exitCode: number; stdout: string };
        shared: { exitCode: number; stdout: string };
        v6: { exitCode: number; stdout: string };
        unix: { exitCode: number; stdout: string };
      };
      assert.notEqual(body.denied.exitCode, 0);
      assert.match(body.denied.stderr, /PermissionError|Permission denied/);
      assert.equal(body.offline.stdout.includes("reached"), false);
      assert.notEqual(body.offline.exitCode, 0);
      assert.equal(body.api.stdout.includes("reached-api"), false);
      assert.notEqual(body.api.exitCode, 0);
      assert.equal(body.shared.stdout.includes("wrote-shared"), false);
      assert.notEqual(body.shared.exitCode, 0);
      assert.equal(body.v6.stdout.includes("reached-v6"), false);
      assert.notEqual(body.v6.exitCode, 0);
      assert.equal(body.unix.stdout.includes("bound-unix"), false);
      assert.notEqual(body.unix.exitCode, 0);
    } finally {
      await exec("docker", ["rm", "-f", container]).catch(() => {});
    }
  });
});
