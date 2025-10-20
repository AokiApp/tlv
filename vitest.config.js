import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/_migrated/**"],
    coverage: {
      enabled: true,
      provider: "istanbul",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "tests/**",
        "examples/**",
        "dist/**",
        ".changeset/**",
        "**/*.d.ts",
      ],
    },
  },
});
