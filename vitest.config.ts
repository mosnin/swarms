import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // The eager `env` export fails fast on import; skip that for tests, which
    // validate the pure `parseEnv` function directly instead.
    env: { SKIP_ENV_VALIDATION: "true" },
    include: ["src/**/*.{test,spec}.ts"],
    // Playwright specs live under e2e/ and use their own runner.
    exclude: ["node_modules", ".next", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
