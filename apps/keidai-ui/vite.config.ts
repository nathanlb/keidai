import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { isOperatorApiSsePath } from "@keidai/shared";
import { defineConfig, type ProxyOptions } from "vite";

/**
 * Local Vite HMR proxies operator edge traffic to the keidai-ui BFF
 * (`pnpm dev:bff` on :3001 by default). Auth, session, owner enforcement,
 * and backend routing live only in the BFF — do not re-list OPERATOR_API_ROUTES
 * here.
 */
function bffUrl(): string {
  return process.env.VITE_BFF_URL ?? "http://127.0.0.1:3001";
}

function proxyToBff(): ProxyOptions {
  return {
    target: bffUrl(),
    changeOrigin: true,
    // Long-lived SSE (runs / traces / connections) must not hit proxy timeouts.
    timeout: 0,
    proxyTimeout: 0,
    configure: (proxyServer) => {
      proxyServer.on("proxyReq", (proxyReq, req) => {
        // Browser Host (:3000) — BFF/Torii use this for OAuth callback URLs.
        const host = req.headers.host;
        if (host) {
          proxyReq.setHeader("x-forwarded-host", host);
        }
        proxyReq.setHeader("x-forwarded-proto", "http");
      });
      proxyServer.on("proxyRes", (proxyRes, req) => {
        const url = req.url ?? "";
        if (!isOperatorApiSsePath(url)) {
          return;
        }
        proxyRes.headers["cache-control"] = "no-cache, no-transform";
        proxyRes.headers["x-accel-buffering"] = "no";
        delete proxyRes.headers["content-length"];
        delete proxyRes.headers["content-encoding"];
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Browser-facing origin must be `localhost` (matches IdP redirect URIs +
    // k8s TORII_GATEWAY_BASE_URL). Keep loopback service URLs on 127.0.0.1.
    host: "localhost",
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": proxyToBff(),
      "/auth": proxyToBff(),
      "/oauth/callback": proxyToBff(),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: (id) =>
                id.includes("node_modules") &&
                (id.includes("/react-dom/") ||
                  id.includes("/react/") ||
                  id.includes("/react-router") ||
                  id.includes("/scheduler/")),
            },
            {
              name: "icons",
              test: (id) =>
                id.includes("/lucide-react/") || id.includes("/simple-icons/"),
            },
            {
              name: "ui-vendor",
              test: (id) =>
                id.includes("node_modules") &&
                (id.includes("/@radix-ui/") ||
                  id.includes("/@keidai/ui/") ||
                  id.includes("/class-variance-authority/") ||
                  id.includes("/clsx/") ||
                  id.includes("/tailwind-merge/")),
            },
            {
              name: "swr",
              test: (id) => id.includes("/swr/"),
            },
          ],
        },
      },
    },
  },
});
