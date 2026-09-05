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
