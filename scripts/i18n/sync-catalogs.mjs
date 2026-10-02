#!/usr/bin/env node
// Keeps every locale's catalogs shaped like English: a key added to
// packages/i18n/messages/en/<ns>.json is copied (with its English text) into
// each other locale until the translation pass replaces it, and a key
// removed from English is removed everywhere. Values the translators have
// already written are never touched — with one exception: a value that
// takes arguments the English message no longer takes ("{countLabel}" where
// English now says "{people}") is a copy of an older English sentence, and
// formatting it would fail in front of a reader. It is replaced by the
// current English until it is translated again.
//
//   node scripts/i18n/sync-catalogs.mjs           # sync
//   node scripts/i18n/sync-catalogs.mjs --todo    # list keys still in English

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const requireFromI18n = createRequire(
  fileURLToPath(new URL("../../packages/i18n/package.json", import.meta.url)),
);
const requireFromFormat = createRequire(
  createRequire(requireFromI18n.resolve("use-intl")).resolve(
    "intl-messageformat",
  ),
);
const { parse: parseIcu } = requireFromFormat(
  "@formatjs/icu-messageformat-parser",
);

/** The argument and tag names of a message, or null when it does not parse. */
function valuesOf(message) {
  if (typeof message !== "string") return new Set();
  let ast;
  try {
    ast = parseIcu(message, { ignoreTag: false });
  } catch {
    return null;
  }
  const names = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 0 || node.type === 7) continue;
      names.add(node.type === 8 ? `<${node.value}>` : node.value);
      if (node.options) {
        for (const option of Object.values(node.options)) walk(option.value);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(ast);
  return names;
}

/** Whether `value` can stand where English says `english`. */
function fits(value, english) {
  const given = valuesOf(value);
  const wanted = valuesOf(english);
  if (!given) return false;
  if (!wanted) return true; // English itself is broken: reported elsewhere
  return [...given].every((name) => wanted.has(name));
}

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
let stale = 0;
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
      const kept = key in current && fits(current[key], text);
      if (key in current && !kept) stale++;
      next[key] = kept ? current[key] : text;
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
if (stale) {
  console.log(
    `${stale} stale value${stale === 1 ? "" : "s"} (written for an older English message) replaced by the current English.`,
  );
}
