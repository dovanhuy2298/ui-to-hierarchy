import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    // Mirror the tsup build-time substitution so tests see the same constant.
    __TOOL_VERSION__: JSON.stringify("0.0.0-test"),
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
