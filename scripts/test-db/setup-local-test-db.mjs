#!/usr/bin/env node
// Spins up a disposable local Supabase stack for the integration test suite
// (packages/services/src/__integration__/**).
//
// Why this doesn't just run `supabase start` on the repo's real
// supabase/migrations/: a from-scratch replay of that directory fails part
// way through with tables/functions referenced before they're created (e.g.
// enable_rls_events_batch2.sql, dated 2026-08-25, enables RLS on
// public.event_review -- but that table isn't CREATEd until a file dated
// 2026-08-28). Comparing every committed filename's timestamp against
// `supabase migrations list` (the project's own applied-migration history,
// snapshotted in production-migration-versions.json) shows this isn't one
// or two mistakes: roughly 70 of the 140 committed files were renamed at
// some point to different, mostly LATER timestamps than the version they
// actually applied under on production -- e.g. this repo's
// 20260828090000_add_event_reviews_and_review_photos.sql really applied as
// 20260823005033, five days earlier, and 20260829090000_add_event_promotions.sql
// really applied as 20260825102741. Once files carrying a real table's
// creation get shoved artificially far into the future like that, whatever
// depends on that table (an RLS-enabling migration correctly still dated
// close to when it truly ran) ends up sorting BEFORE it, and a from-scratch
// replay breaks. See docs/audit/01-limitations-register.md ("Migration
// replay ordering bug") for the full writeup.
//
// Renaming the real committed files to their true versions would be the
// permanent fix, but it changes the identity of migrations already recorded
// as applied on production (supabase_migrations.schema_migrations tracks
// them by version) -- a separate, deliberate decision this script does not
// make on its own. Instead it copies the whole supabase/ directory into a
// throwaway workdir and renames files in ONLY that copy back to their true
// applied version (matching by migration name against
// production-migration-versions.json), then points the Supabase CLI at it
// with --workdir. The real supabase/migrations/ directory is never written
// to, only copied from. A file with no match in that list (roughly 30,
// mostly from 2026-08-15..19) is left at its current position -- it either
// predates when this project started recording migration history in a way
// list_migrations can see, or its effect was folded into a later file; none
// of them caused a replay failure in testing.
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
const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const ENV_FILE = join(ROOT, ".env.test.local");

function runSupabase(args, options = {}) {
  return execFileSync("supabase", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
}

// A handful of migrations were, per production-migration-versions.json,
// first applied at an early true version -- but their CURRENT committed
// content clearly reflects a later edit-and-rerun (it references a column
// or function that another, later-true-versioned migration adds), the same
// squash-without-renaming pattern documented at the top of this file. Their
// name-matched true version is correct for when the file was FIRST applied,
// but not for what has to precede its content today. Layered on top of the
// name-matched rename as small, explicit, individually-justified overrides.
const CONTENT_OVERRIDES = [
  // add_event_promotions's payment_attempt_target_check CHECK constraint
  // references place_promotion_checkout_id, a column add_place_promotions
  // (true version 20260826090000) adds -- so despite this file's own true
  // first-applied version being 20260825102741 (earlier), its current
  // content can't run before add_place_promotions. Its own two immediate
  // successors (checkout expiry, end-date compute) depend on the
  // event_promotion_checkout type this file creates, so they move with it
  // as a unit, preserving their relative order.
  { name: "add_event_promotions", version: "20260826090001" },
  { name: "add_event_promotion_checkout_expiry", version: "20260826090002" },
  { name: "add_compute_event_promotion_end_date", version: "20260826090003" },
  // batch2/3/4 have to move together, preserving their relative order:
  // batch2 enables RLS on event_promotion_tier/_checkout (now created just
  // above); batch3 both CREATEs public.is_admin() AND enables RLS on
  // place_promotion_tier/_checkout (add_place_promotions, 20260826090000);
  // batch4 USEs public.is_admin() in three policies, so it can't run before
  // batch3 defines it. All three's true versions (Aug 25, ~10:53-10:56) are
  // otherwise adjacent and in this same order, so only the block as a whole
  // is being moved, not reordered internally.
  { name: "enable_rls_events_batch2", version: "20260826090004" },
  { name: "enable_rls_places_batch3", version: "20260826090005" },
  { name: "enable_rls_social_batch4", version: "20260826090006" },
  // security_cleanup_batch7 REVOKEs EXECUTE on public.is_admin() -- needs
  // batch3 (above) to have defined it, and its true version (right after
  // batch4's) already puts it next regardless.
  {
    name: "security_cleanup_batch7_revoke_rpc_grants",
    version: "20260826090007",
  },
  // security_cleanup_batch6 ALTERs the get_filtered_events(..., p_event_type
  // text, ..., p_page_size integer) 15-arg overload that add_public_
  // attendance_count_rpcs creates (true version 20260902120000, unrenamed)
  // -- an 8-day gap from batch6's own true version, another sign this
  // search_path-hardening sweep was periodically re-run as new overloads of
  // heavily-reused functions were added.
  //
  // Their true versions (20260825105907 then 20260825112821) already have
  // batch6 running before fix_search_path_syntax_regression, and that order
  // is load-bearing, not incidental: batch6's ALTER FUNCTION statements use
  // `SET search_path = 'public, extensions'` -- ONE quoted string
  // containing a comma, which Postgres treats as search_path being a
  // single (non-existent) schema literally named "public, extensions",
  // silently breaking unqualified name resolution inside every function it
  // touches (reproduced directly: create_event(...) fails with `relation
  // "event" does not exist` once this runs). fix_search_path_syntax_
  // regression's whole job -- per its own name -- is to redo the same
  // ALTERs with the correct unquoted `SET search_path TO public,
  // extensions`. Both must move together as a unit to reach
  // add_public_attendance_count_rpcs, preserving batch6-then-regression-fix.
  { name: "security_cleanup_batch6", version: "20260902120001" },
  { name: "fix_search_path_syntax_regression", version: "20260902120002" },
];

function reorderMigrationsToTrueAppliedVersions(migrationsDir) {
  const { migrations: trueVersions } = JSON.parse(
    readFileSync(
      join(SCRIPT_DIR, "production-migration-versions.json"),
      "utf8",
    ),
  );
  const trueVersionByName = new Map(
    trueVersions.map((m) => [m.name, m.version]),
  );
  for (const { name, version } of CONTENT_OVERRIDES) {
    trueVersionByName.set(name, version);
  }

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  let renamed = 0;
  for (const file of files) {
    const match = file.match(/^(\d{14})_(.+)\.sql$/);
    if (!match) continue;
    const [, currentVersion, name] = match;
    const trueVersion = trueVersionByName.get(name);
    if (!trueVersion || trueVersion === currentVersion) continue;

    renameSync(
      join(migrationsDir, file),
      join(migrationsDir, `${trueVersion}_${name}.sql`),
    );
    renamed++;
  }
  console.log(
    `[test-db] Reordered (copy only) ${renamed} migration(s) to their true applied version.`,
  );
}

// Statements that are provably dead by the time this script's reordering
// lets them run: they target a function overload that a later-but-now-
// earlier-running migration has already DROPped. Not a reordering problem
// (there is no position where both this statement and its DROP FUNCTION
// could be satisfied -- the file mixes statements from genuinely different
// points in the schema's history), so the statement is neutralized in the
// copy instead. Safe: `fix_event_type_serialization.sql` (true version
// 20260826100454) explicitly drops this exact 11-arg get_filtered_events
// overload as dead code left behind when a 15-arg cursor-pagination version
// replaced it, so a SET search_path on it has no effect to preserve.
const DEAD_STATEMENT_PATTERNS = [
  /^ALTER FUNCTION public\.get_filtered_events\(numeric, numeric, timestamp with time zone, timestamp with time zone, double precision, double precision, double precision, text, text, text, numeric\) SET search_path.*;$/gm,
  // Same batch6 file, a different statement with the opposite timing
  // problem: `ALTER TABLE public.user_info DROP CONSTRAINT IF EXISTS
  // user_info_id_key` (a redundant duplicate of user_info_pkey) can only
  // succeed before any of the ~35 FK constraints across the schema that
  // bind to it exist -- i.e. very early, not at batch6's Sept-2 position
  // this script needs for its other statements. Skipping it changes
  // nothing observable: user_info_id_key stays as a harmless redundant
  // UNIQUE constraint alongside the real PK, exactly as it does on
  // production today (this cleanup step never actually completed there
  // either, or this same dependency error would have blocked it).
  /^ALTER TABLE public\.user_info DROP CONSTRAINT IF EXISTS user_info_id_key;$/gm,
];

function patchDeadStatements(migrationsDir) {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  let patched = 0;
  for (const file of files) {
    const path = join(migrationsDir, file);
    let sql = readFileSync(path, "utf8");
    let changed = false;
    for (const pattern of DEAD_STATEMENT_PATTERNS) {
      const next = sql.replace(
        pattern,
        (line) =>
          `-- [test-db: dead statement, target already dropped] ${line}`,
      );
      if (next !== sql) {
        sql = next;
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(path, sql);
      patched++;
    }
  }
  console.log(
    `[test-db] Neutralized dead statements (copy only) in ${patched} file(s).`,
  );
}

// These three migrations are, by their own header comments, inherently
// production-only: each one looks up the live `cleanupExpiredEvents`
// pg_cron job (created directly via SQL against the live project, "never a
// repo migration" -- see SEC-004 in docs/audit/01-limitations-register.md)
// and RAISEs EXCEPTION if it isn't found. A fresh local database has no
// such job, so they can never succeed there and aren't trying to -- this
// isn't the renamed-timestamp problem the rest of this script works around,
// just genuinely environment-specific SQL. None of the three touch any
// table, column or function this test suite (or anything before it in the
// migration list) depends on, so skipping them changes nothing observable
// locally.
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
// on every auth.users insert -- see 20260823194629_phone_auth_and_profile_
// completion.sql) fails for every single signup, including this test
// suite's. This is a real, separate gap that would block ANY local
// developer's first signup against a from-scratch `supabase start`, not
// just this test suite -- worth a real supabase/seed.sql in the repo, but
// that's a repo-wide decision outside this script's scope, so it's seeded
// here only for this throwaway copy.
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
  // local Postgres image looks like before any migration has run. Patched
  // only in this throwaway copy -- see this file's top comment.
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
  reorderMigrationsToTrueAppliedVersions(migrationsDir);
  skipProductionOnlyMigrations(migrationsDir);
  patchDeadStatements(migrationsDir);
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
