import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import {
  OPERATOR_API_ROUTES,
  isOperatorApiSsePath,
  rewriteOperatorApiPath,
  type OperatorApiBackend,
} from "@keidai/shared";
import { defineConfig, type ProxyOptions } from "vite";

function backendUrl(backend: OperatorApiBackend): string {
  switch (backend) {
    case "torii":
      return process.env.VITE_TORII_URL ?? "http://127.0.0.1:3100";
    case "shaiden":
      return process.env.VITE_SHAIDEN_URL ?? "http://127.0.0.1:3200";
    case "fuda":
      return process.env.VITE_FUDA_URL ?? "http://127.0.0.1:3300";
  }
}

function buildDevProxy(): Record<string, ProxyOptions> {
  const proxy: Record<string, ProxyOptions> = {};

  for (const route of OPERATOR_API_ROUTES) {
    proxy[route.prefix] = {
      target: backendUrl(route.backend),
      changeOrigin: true,
      ...(route.pathRewrite
        ? {
            rewrite: (path) => rewriteOperatorApiPath(path, route),
          }
        : {}),
      configure: (proxyServer) => {
        proxyServer.on("proxyRes", (proxyRes, req) => {
          const url = req.url ?? "";
          if (!isOperatorApiSsePath(url)) {
            return;
          }
          // Keep SSE chunks unbuffered through the Vite proxy.
          proxyRes.headers["cache-control"] = "no-cache, no-transform";
          proxyRes.headers["x-accel-buffering"] = "no";
          delete proxyRes.headers["content-length"];
          delete proxyRes.headers["content-encoding"];
        });
      },
    };
  }

  return proxy;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    proxy: buildDevProxy(),
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (
            id.includes("/react-dom/") ||
            id.includes("/react/") ||
            id.includes("/react-router") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }

          if (id.includes("/lucide-react/")) {
            return "icons";
          }

          if (
            id.includes("/@radix-ui/") ||
            id.includes("/@keidai/ui/") ||
            id.includes("/class-variance-authority/") ||
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/")
          ) {
            return "ui-vendor";
          }

          if (id.includes("/swr/")) {
            return "swr";
          }
        },
      },
    },
  },
});
