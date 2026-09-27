#!/usr/bin/env node
// Every translation catalog has exactly the keys the English one has.
//
// next-intl has no fallback locale here (packages/i18n/src/catalog.ts loads
// one locale's files and nothing else), so a key missing from, say, the
// French catalog shows its raw path -- "navigation.create" -- to everyone
// reading in French. On 2026-09-27 the renamed "create" nav key and ten
// phone-security keys were missing from all five other locales.
//
// Run: node scripts/check-i18n.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MESSAGES = fileURLToPath(
  new URL("../packages/i18n/messages", import.meta.url),
);
const BASE = "en";

function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" && !Array.isArray(child)
      ? flatten(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function keysOf(locale, file) {
  const json = JSON.parse(readFileSync(join(MESSAGES, locale, file), "utf8"));
  return new Set(flatten(json));
}

const locales = readdirSync(MESSAGES).filter((name) => name !== BASE);
const files = readdirSync(join(MESSAGES, BASE)).filter((name) =>
  name.endsWith(".json"),
);

const problems = [];
for (const file of files) {
  const base = keysOf(BASE, file);
  for (const locale of locales) {
    let keys;
    try {
      keys = keysOf(locale, file);
    } catch {
      problems.push(`${locale}/${file}: missing file`);
      continue;
    }
    const missing = [...base].filter((key) => !keys.has(key));
    const extra = [...keys].filter((key) => !base.has(key));
    if (missing.length)
      problems.push(`${locale}/${file}: missing ${missing.join(", ")}`);
    if (extra.length)
      problems.push(`${locale}/${file}: not in ${BASE} ${extra.join(", ")}`);
  }
}

if (problems.length) {
  console.error("Translation catalogs disagree with English:");
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}
console.log(
  `i18n: ${locales.length} locales match ${BASE} across ${files.length} files.`,
);
