import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolve @aokiapp/tlv/* via tests/tsconfig.json without changing test imports
  plugins: [
    tsconfigPaths({
      projects: ["./tests/tsconfig.json"],
    }),
  ],
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/_migrated/**"],
    // Inline the package entrypoints so Vite transforms & instruments source for coverage
    server: {
      deps: {
        inline: [
          "@aokiapp/tlv",
          "@aokiapp/tlv/parser",
          "@aokiapp/tlv/builder",
          "@aokiapp/tlv/common",
        ],
      },
    },
    coverage: {
      enabled: true,
      provider: "istanbul",
      reporter: ["text", "text-summary"],
      include: ["src/**/*.ts"],
      exclude: [
        "tests/**",
        "examples/**",
        ".changeset/**",
        "**/*.d.ts",
      ],
    },
  },
});
