#!/usr/bin/env node
// The database says things to people too: Abonten's own functions and
// triggers `raise exception 'Only % tickets left'` and the services pass
// that text on (userFacingError). SQL cannot read the catalogs, so the
// English text itself is the key: this script collects every such message
// from supabase/migrations into the `db` group of the `server` catalog,
// and @abonten/i18n/server's translateServerText() swaps a message for its
// translation at the edge of a response. A `%` placeholder becomes {0},
// {1}, … and is matched by pattern.
//
//   node scripts/i18n/extract-sql-messages.mjs           # update the catalog
//   node scripts/i18n/extract-sql-messages.mjs --check   # CI: catalog is current

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const MIGRATIONS = join(ROOT, "supabase/migrations");
const MESSAGES = join(ROOT, "packages/i18n/messages");
const CHECK = process.argv.includes("--check");

// Messages only an engineer ever reads (deploy sanity checks, migration
// guards): nobody translates them.
const INTERNAL =
  /aborting|nothing changed|rewrite|hard-code|still assume|still reference|cron\.job|anon key|service-role key|\bmigration\b|deploy/i;

const texts = new Set();
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))) {
  const sql = readFileSync(join(MIGRATIONS, file), "utf8");
  // raise exception 'text'  |  raise exception 'text %', arg  — the string
  // literal right after the keyword; '' is an escaped quote.
  const re = /raise\s+exception\s+'((?:[^']|'')*)'/gi;
  for (const m of sql.matchAll(re)) {
    const text = m[1].replace(/''/g, "'").trim();
    if (!text || !/[A-Za-z]{2}/.test(text)) continue;
    // '%' alone forwards another message (its own entry, elsewhere).
    if (text === "%") continue;
    if (INTERNAL.test(text)) continue;
    // Function and column names in the message are engineer-facing.
    if (/^[a-z_]+:/.test(text) && !/\s/.test(text.split(":")[0])) {
      // "area_waitlist_notify: unknown region %" — keep only the human part
      // after the prefix? These name a function: skip.
      continue;
    }
    texts.add(text);
  }
}

// Stable keys: a slug of the English, numbered on collision. {0}, {1} for %.
function slug(text) {
  const words = text
    .replace(/%/g, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 7);
  const base = words
    .map((w, i) =>
      i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join("");
  return /^[a-z]/.test(base) ? base : `m${base}`;
}

function icu(text) {
  let n = 0;
  return text.replace(/%/g, () => `{${n++}}`);
}

const sorted = [...texts].sort((a, b) => a.localeCompare(b));
const db = {};
const used = new Set();
for (const text of sorted) {
  let key = slug(text) || "message";
  let i = 2;
  while (used.has(key)) key = `${slug(text)}${i++}`;
  used.add(key);
  db[key] = icu(text);
}

const path = join(MESSAGES, "en/server.json");
const current = JSON.parse(readFileSync(path, "utf8"));
const next = { ...current, db };
const nextText = `${JSON.stringify(next, null, 2)}\n`;
// Only the `db` group is this script's: the rest of the file belongs to
// extract-strings.mjs and may be re-sorted by it.
const entries = (group) => JSON.stringify(Object.entries(group ?? {}).sort());
const same = entries(current.db) === entries(db);

if (CHECK) {
  if (!same) {
    console.error(
      "server catalog: the `db` messages are out of date with supabase/migrations. Run: node scripts/i18n/extract-sql-messages.mjs",
    );
    process.exit(1);
  }
  console.log(`server catalog: ${sorted.length} database messages, current.`);
} else {
  writeFileSync(path, nextText);
  console.log(`server catalog: ${sorted.length} database messages written.`);
}
