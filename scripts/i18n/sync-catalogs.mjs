#!/usr/bin/env node
// Keeps every locale's catalogs shaped like English: a key added to
// packages/i18n/messages/en/<ns>.json is copied (with its English text) into
// each other locale until the translation pass replaces it, and a key
// removed from English is removed everywhere. Values the translators have
// already written are never touched.
//
//   node scripts/i18n/sync-catalogs.mjs           # sync
//   node scripts/i18n/sync-catalogs.mjs --todo    # list keys still in English

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MESSAGES = fileURLToPath(
  new URL("../../packages/i18n/messages", import.meta.url),
);
const TODO = process.argv.includes("--todo");

const locales = readdirSync(MESSAGES).filter((d) => !d.includes("."));
const files = readdirSync(join(MESSAGES, "en")).filter((f) =>
  f.endsWith(".json"),
);

function flatten(value, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(value)) {
    if (v && typeof v === "object" && !Array.isArray(v))
      flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split(".");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null)
        cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return sortKeys(out);
}

function sortKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, sortKeys(obj[k])]),
  );
}

let todo = 0;
for (const file of files) {
  const en = flatten(
    JSON.parse(readFileSync(join(MESSAGES, "en", file), "utf8")),
  );
  for (const locale of locales) {
    if (locale === "en") continue;
    const path = join(MESSAGES, locale, file);
    let current = {};
    try {
      current = flatten(JSON.parse(readFileSync(path, "utf8")));
    } catch {
      current = {};
    }
    const next = {};
    for (const [key, text] of Object.entries(en)) {
      next[key] = key in current ? current[key] : text;
      if (
        TODO &&
        next[key] === text &&
        typeof text === "string" &&
        /\p{L}/u.test(text)
      ) {
        todo++;
        console.log(`${locale}/${file} ${key} = ${JSON.stringify(text)}`);
      }
    }
    if (!TODO) {
      writeFileSync(path, `${JSON.stringify(unflatten(next), null, 2)}\n`);
    }
  }
}
if (TODO) console.error(`${todo} values still equal to English.`);
