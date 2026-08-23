// Standalone Vitest config — deliberately NOT vite.config.ts: that one loads the
// Cloudflare Worker plugin, whose environments are incompatible with Vitest's
// runner. Tests cover the pure calculation libs only (no DOM, no Worker runtime).
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
