import { defineConfig } from "vitest/config";

// Default `npm run test` (unit tests only) -- integration tests need a
// local Supabase stack (npm run test:db:up) and run via
// `npm run test:integration` / vitest.integration.config.ts instead.
export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/__integration__/**"],
  },
});
