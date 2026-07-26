import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest runs the pure-logic modules (session-types, synthetic services)
 * under Node without the full React Native renderer. Component-level RN
 * rendering tests use `@testing-library/react-native`'s Node preset directly
 * via Jest-compatible mocks where needed; this config focuses on the
 * service/logic layer, which is where the meaningful gate/validation
 * assertions live.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
});
