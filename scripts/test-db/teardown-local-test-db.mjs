#!/usr/bin/env node
// Stops the disposable local Supabase stack started by
// setup-local-test-db.mjs and removes its workdir.
//
// Usage: node scripts/test-db/teardown-local-test-db.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENV_FILE = join(ROOT, ".env.test.local");

function main() {
  if (!existsSync(ENV_FILE)) {
    console.log("[test-db] No .env.test.local found -- nothing to tear down.");
    return;
  }

  const contents = readFileSync(ENV_FILE, "utf8");
  const match = contents.match(/^SUPABASE_TEST_WORKDIR=(.+)$/m);
  const workdir = match?.[1]?.trim();

  if (workdir && existsSync(workdir)) {
    console.log(`[test-db] Stopping local Supabase stack at ${workdir}...`);
    try {
      execFileSync("supabase", ["stop", "--workdir", workdir, "--no-backup"], {
        stdio: "inherit",
        shell: process.platform === "win32",
      });
    } catch (err) {
      console.warn(
        "[test-db] 'supabase stop' failed (containers may already be down):",
        err.message,
      );
    }
    rmSync(workdir, { recursive: true, force: true });
    console.log(`[test-db] Removed workdir ${workdir}`);
  }

  unlinkSync(ENV_FILE);
  console.log(`[test-db] Removed ${ENV_FILE}`);
}

main();
