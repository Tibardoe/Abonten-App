// Loads connection info written by scripts/test-db/setup-local-test-db.mjs
// (repo root .env.test.local) into process.env before any integration test
// file runs. Deliberately not the `dotenv` package: the format is fully
// controlled by that one script (simple KEY=VALUE lines, no quoting/
// interpolation to support), so a tiny parser avoids a new dependency for
// something this narrow.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (
      existsSync(join(dir, ".env.test.local")) ||
      existsSync(join(dir, "pnpm-workspace.yaml")) ||
      existsSync(join(dir, "turbo.json"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

const repoRoot = findRepoRoot(fileURLToPath(new URL(".", import.meta.url)));
const envPath = join(repoRoot, ".env.test.local");

if (!existsSync(envPath)) {
  throw new Error(
    `${envPath} not found. Run "npm run test:db:up" at the repo root before "npm run test:integration".`,
  );
}

for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

// Every payment test replaces the provider HTTP layer (vi.mock of
// providers/paystackApi), but the provider registry still has to BUILD the
// Ghana account from the variables the market row names before any call is
// made. These are placeholders for the test process only — nothing here
// reaches a provider — and a real value in the environment wins.
process.env.PAYSTACK_SECRET_KEY ??= "sk_test_placeholder_integration_suite";
process.env.PAYSTACK_WEBHOOK_SECRET ??= "whsec_placeholder_integration_suite";

// Market configuration, the provider registry and other shared services
// read through the service-role client, exactly as in production, so the
// suite points that client at the local stack for every file (several files
// already did this themselves).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
