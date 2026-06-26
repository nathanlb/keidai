import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/tests/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/tests/**/*.test.{ts,tsx}"],
          exclude: ["src/**/tests/**/*.browser.test.{ts,tsx}"],
          setupFiles: ["src/tests/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
          include: ["src/**/tests/**/*.browser.test.{ts,tsx}"],
        },
      },
    ],
  },
});
