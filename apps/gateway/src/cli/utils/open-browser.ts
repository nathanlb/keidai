import { spawn } from "node:child_process";

export async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  const command =
    platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [url], {
      detached: true,
      stdio: "ignore",
      shell: platform === "win32",
    });
    child.on("error", reject);
    child.unref();
    resolve();
  });
}
