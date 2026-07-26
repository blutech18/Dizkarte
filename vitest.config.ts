import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolvePath = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

/**
 * Root Vitest configuration.
 *
 * Aliases point workspace package names at their TypeScript source so unit
 * tests run without a prior build step. Runtime/app bundling resolves the same
 * package names through each package's `exports` map instead.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@dizkarte/config": resolvePath("./packages/config/src/index.ts"),
      "@dizkarte/domain": resolvePath("./packages/domain/src/index.ts"),
      "@dizkarte/adapter-supabase": resolvePath("./packages/adapter-supabase/src/index.ts"),
    },
  },
  test: {
    globals: false,
    environment: "node",
    include: ["packages/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/index.ts", "**/*.d.ts"],
    },
  },
});
