import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** @type {import("node:child_process").ChildProcess[]} */
const children = [];
let shuttingDown = false;

/**
 * @param {string} label
 * @param {string} command
 * @param {string[]} args
 */
function start(label, command, args) {
  const child = spawn(command, args, {
    cwd: pkgRoot,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown || signal) {
      return;
    }
    console.error(`[dev] ${label} exited with code ${code ?? 0}`);
    shutdown(code ?? 1);
  });
  children.push(child);
}

/** @param {number} [code] */
function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("bff", "pnpm", ["exec", "tsx", "watch", "server/dev.ts"]);
start("vite", "pnpm", ["exec", "vite"]);
