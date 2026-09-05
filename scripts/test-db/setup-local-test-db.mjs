#!/usr/bin/env node
// Spins up a disposable local Supabase stack for the integration test suite
// (packages/services/src/__integration__/**).
//
// 2026-09-05: supabase/migrations/ filenames were permanently corrected to
// match production's true applied order (see docs/audit/01-limitations-
// register.md, "Migration replay ordering bug" -- ~70 files had been
// renamed at some point to fabricated, mostly-later timestamps). That fix
// makes almost everything replay cleanly from scratch. A handful of
// individual statements are still genuinely irreducible by timestamp alone
// -- their file's dominant content applied at its recorded true version,
// but a specific block within it was evidently appended in a LATER
// edit-and-rerun that never got its own migration entry, so no position for
// the file as a whole satisfies both parts. Each is documented with a
// dated NOTE comment directly in its migration file; this script neutralizes
// exactly those, and only in a disposable copy -- the real
// supabase/migrations/ directory is never written to, only copied from.
//
// Usage: node scripts/test-db/setup-local-test-db.mjs
// Writes connection info for the copy to .env.test.local at the repo root.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ENV_FILE = join(ROOT, ".env.test.local");

function runSupabase(args, options = {}) {
  return execFileSync("supabase", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

// Each entry neutralizes one statement or contiguous block that a migration
// file's own NOTE comment (added 2026-09-05) documents as unreplayable from
// scratch at that file's true position. `match` is matched against the
// whole file content; everything it captures is prefixed line-by-line with
// a skip marker rather than deleted, so a diff of the copy stays legible.
const IRREDUCIBLE_STATEMENTS = [
  {
    file: "20260825102741_add_event_promotions.sql",
    // Only the widened 4-way payment_attempt_target_check (not the
    // event_promotion_checkout_id column/FK just above it, which are
    // self-contained) -- references place_promotion_checkout_id, added by
    // add_place_promotions.sql (true version 20260826090000, a day later).
    match:
      /^ALTER TABLE public\.payment_attempt DROP CONSTRAINT payment_attempt_target_check;\n[\s\S]*?^\);$/m,
  },
  {
    file: "20260825105513_enable_rls_places_batch3.sql",
    // The whole place_promotion(_tier)/place_promotion_checkout RLS block --
    // those tables don't exist until add_place_promotions.sql (same true
    // version gap as above).
    match:
      /^ALTER TABLE public\.place_promotion_tier ENABLE ROW LEVEL SECURITY;\n[\s\S]*?FOR UPDATE USING \(\(select auth\.uid\(\)\) = owner_id\) WITH CHECK \(\(select auth\.uid\(\)\) = owner_id\);$/m,
  },
  {
    file: "20260825105907_security_cleanup_batch6.sql",
    // References the 15-arg get_filtered_events overload, not created
    // until add_public_attendance_count_rpcs.sql (true version
    // 20260902120000, over a week later).
    match:
      /^ALTER FUNCTION public\.get_filtered_events\(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric, timestamp with time zone, double precision, uuid, integer\) SET search_path.*;$/m,
  },
  {
    file: "20260825105907_security_cleanup_batch6.sql",
    // References get_active_place_promotions, not created until
    // add_get_active_place_promotions_rpc.sql (true version 20260826090300,
    // the next day).
    match:
      /^ALTER FUNCTION public\.get_active_place_promotions\(double precision, double precision, double precision, integer\) SET search_path.*;$/m,
  },
  {
    file: "20260825105907_security_cleanup_batch6.sql",
    // Irreducible regardless of position: dozens of FK constraints across
    // the schema (all predating this file) bind to user_info_id_key, so
    // DROP CONSTRAINT hits a hard dependency error on a from-scratch
    // replay no matter where this file runs.
    match:
      /^ALTER TABLE public\.user_info DROP CONSTRAINT IF EXISTS user_info_id_key;$/m,
  },
  {
    file: "20260825105907_security_cleanup_batch6.sql",
    // References public.place_drafts, not created until
    // 20260827090000_add_place_drafts.sql, two days later. That file has
    // no entry in production's migration history at all, unlike everything
    // else this audit checked.
    match:
      /^ALTER POLICY place_drafts_owner_all ON public\.place_drafts\n[\s\S]*?WITH CHECK \(EXISTS \(SELECT 1 FROM public\.drafts d WHERE d\.id = place_drafts\.draft_id AND d\.user_id = \(select auth\.uid\(\)\)\)\);$/m,
  },
  {
    file: "20260825112821_fix_search_path_syntax_regression.sql",
    // Same two forward references as security_cleanup_batch6.sql above --
    // this file re-covers the same functions with corrected syntax.
    match:
      /^ALTER FUNCTION public\.get_filtered_events\(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric, timestamp with time zone, double precision, uuid, integer\) SET search_path.*;$/m,
  },
  {
    file: "20260825112821_fix_search_path_syntax_regression.sql",
    match:
      /^ALTER FUNCTION public\.get_active_place_promotions\(double precision, double precision, double precision, integer\) SET search_path.*;$/m,
  },
];

function neutralizeIrreducibleStatements(migrationsDir) {
  const touched = new Set();
  for (const { file, match } of IRREDUCIBLE_STATEMENTS) {
    const path = join(migrationsDir, file);
    // Migration files are CRLF; normalize to LF so the patterns above (which
    // anchor on bare \n) match, then write back as LF -- Postgres doesn't
    // care, and this is a throwaway copy anyway.
    const sql = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    const found = sql.match(match);
    if (!found) {
      throw new Error(
        `[test-db] Expected pattern not found in ${file}. The migration file must have changed since this script's own NOTE comment was written there -- update both.`,
      );
    }
    const commented = found[0]
      .split("\n")
      .map((line) => `-- [test-db, see this file's own NOTE] ${line}`)
      .join("\n");
    writeFileSync(path, sql.replace(match, commented));
    touched.add(file);
  }
  console.log(
    `[test-db] Neutralized ${IRREDUCIBLE_STATEMENTS.length} irreducible statement(s) (copy only) across ${touched.size} file(s).`,
  );
}

// These three migrations are, by their own header comments, inherently
// production-only: each one looks up the live `cleanupExpiredEvents`
// pg_cron job (created directly via SQL against the live project, "never a
// repo migration" -- see SEC-004 in docs/audit/01-limitations-register.md)
// and RAISEs EXCEPTION if it isn't found. A fresh local database has no
// such job, so skipping them changes nothing observable locally.
const SKIP_MIGRATIONS_NOT_APPLICABLE_LOCALLY = new Set([
  "move_cron_service_role_key_to_vault",
  "cleanup_cron_use_anon_key_for_invocation",
  "move_cron_anon_key_to_vault",
]);

function skipProductionOnlyMigrations(migrationsDir) {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  let skipped = 0;
  for (const file of files) {
    const match = file.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) continue;
    const [, , name] = match;
    if (!SKIP_MIGRATIONS_NOT_APPLICABLE_LOCALLY.has(name)) continue;
    renameSync(join(migrationsDir, file), join(migrationsDir, `${file}.skip`));
    skipped++;
  }
  console.log(
    `[test-db] Skipped (copy only) ${skipped} production-only migration(s).`,
  );
}

// public.user_status is a small reference table (id, name) with no seeding
// migration anywhere in the repo and no supabase/seed.sql -- on production
// it holds {1: Active, 2: Suspended, 3: Banned} (confirmed via execute_sql
// against the live project), inserted at some point outside of migration
// history entirely. Without it, public.user_info's status_id FK can never
// be satisfied, so `create_user_info_if_not_exists` (the trigger that fires
// on every auth.users insert) fails for every single signup, including
// this test suite's. Worth a real supabase/seed.sql for every local
// developer's benefit, not just this script -- a separate, repo-wide
// decision left to the owner -- so seeded here only for this copy.
function writeSeedFile(supabaseDir) {
  writeFileSync(
    join(supabaseDir, "seed.sql"),
    [
      "-- Written by scripts/test-db/setup-local-test-db.mjs for this throwaway",
      "-- local stack only -- see that script's writeSeedFile() for why.",
      "INSERT INTO public.user_status (id, name) VALUES",
      "  (1, 'Active'), (2, 'Suspended'), (3, 'Banned')",
      "ON CONFLICT (id) DO NOTHING;",
      "SELECT setval('public.user_status_id_seq', 3, true);",
      "",
    ].join("\n"),
  );
  console.log(
    "[test-db] Wrote seed.sql (copy only): user_status reference rows.",
  );
}

function patchBaselineForFreshLocalPostgres(migrationsDir) {
  // These three statements in the pulled baseline snapshot assume a
  // pre-existing project state (pg_graphql already installed,
  // supabase_privileged_role not yet created/granted) that matches what the
  // live project looked like when it was dumped, but not what a brand-new
  // local Postgres image looks like before any migration has run.
  const baselinePath = join(migrationsDir, "20260810084821_remote_schema.sql");
  let sql = readFileSync(baselinePath, "utf8");

  const patches = [
    [/^DROP EXTENSION pg_graphql;$/m, "DROP EXTENSION IF EXISTS pg_graphql;"],
    [
      /^CREATE ROLE supabase_privileged_role;$/m,
      "DO $do$\nBEGIN\n  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'supabase_privileged_role') THEN\n    CREATE ROLE supabase_privileged_role;\n  END IF;\nEND\n$do$;",
    ],
    [
      /^GRANT supabase_privileged_role TO postgres;$/m,
      "DO $do2$\nBEGIN\n  IF NOT pg_has_role('postgres', 'supabase_privileged_role', 'member') THEN\n    GRANT supabase_privileged_role TO postgres;\n  END IF;\nEND\n$do2$;",
    ],
  ];

  for (const [pattern, replacement] of patches) {
    const next = sql.replace(pattern, replacement);
    if (next === sql) {
      throw new Error(
        `[test-db] Expected pattern not found in the baseline migration copy: ${pattern}. The real migration must have changed; update this script.`,
      );
    }
    sql = next;
  }

  writeFileSync(baselinePath, sql);
  console.log(
    "[test-db] Patched (copy only): 3 fresh-local-Postgres guards in the baseline migration.",
  );
}

function main() {
  const workdir = mkdtempSync(join(tmpdir(), "abonten-test-supabase-"));
  const supabaseSrc = join(ROOT, "supabase");
  const supabaseDest = join(workdir, "supabase");

  console.log(
    `[test-db] Copying supabase/ into disposable workdir: ${workdir}`,
  );
  cpSync(supabaseSrc, supabaseDest, {
    recursive: true,
    filter: (src) => !src.includes(`${join("supabase", ".temp")}`),
  });

  const migrationsDir = join(supabaseDest, "migrations");
  neutralizeIrreducibleStatements(migrationsDir);
  skipProductionOnlyMigrations(migrationsDir);
  patchBaselineForFreshLocalPostgres(migrationsDir);
  writeSeedFile(supabaseDest);

  console.log(
    "[test-db] Starting local Supabase stack (this can take a few minutes on first run)...",
  );
  runSupabase(["start", "--workdir", workdir]);

  const statusJson = execFileSync(
    "supabase",
    ["status", "--workdir", workdir, "-o", "json"],
    {
      shell: process.platform === "win32",
    },
  ).toString();
  const status = JSON.parse(statusJson);

  const apiUrl = status.API_URL ?? status.api_url;
  const anonKey = status.ANON_KEY ?? status.anon_key;
  const serviceRoleKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;

  if (!apiUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      `[test-db] Couldn't parse API_URL/ANON_KEY/SERVICE_ROLE_KEY from 'supabase status' output:\n${statusJson}`,
    );
  }

  writeFileSync(
    ENV_FILE,
    [
      "# Generated by scripts/test-db/setup-local-test-db.mjs -- do not commit.",
      `SUPABASE_TEST_WORKDIR=${workdir}`,
      `SUPABASE_TEST_URL=${apiUrl}`,
      `SUPABASE_TEST_ANON_KEY=${anonKey}`,
      `SUPABASE_TEST_SERVICE_ROLE_KEY=${serviceRoleKey}`,
      "",
    ].join("\n"),
  );

  console.log(`[test-db] Ready. Connection info written to ${ENV_FILE}`);
  console.log(
    "[test-db] Run tests with: npm run test:integration -w @abonten/services",
  );
  console.log("[test-db] Tear down with: npm run test:db:down");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
