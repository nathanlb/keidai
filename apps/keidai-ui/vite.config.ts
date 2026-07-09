import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const gatewayUrl =
  process.env.VITE_GATEWAY_URL ?? "http://127.0.0.1:3100";
const shaidenUrl =
  process.env.VITE_SHAIDEN_URL ?? "http://127.0.0.1:3200";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 3000,
    strictPort: true,
    proxy: {
      // Shaiden owns run visibility; Torii owns the rest of /api.
      "/api/runs": {
        target: shaidenUrl,
        changeOrigin: true,
      },
      "/api": {
        target: gatewayUrl,
        changeOrigin: true,
      },
    },
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
