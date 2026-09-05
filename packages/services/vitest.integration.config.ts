import { defineConfig } from "vitest/config";

// Concurrency/idempotency/authz suite against a real local Supabase stack.
// Run `npm run test:db:up` at the repo root first.
export default defineConfig({
  test: {
    include: ["src/__integration__/**/*.integration.test.ts"],
    setupFiles: ["./src/__integration__/vitest.setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Concurrent test files would race each other's beforeEach/afterEach
    // fixture creation against the same shared local Postgres instance in
    // ways unrelated to what each test is actually trying to prove.
    fileParallelism: false,
  },
});
