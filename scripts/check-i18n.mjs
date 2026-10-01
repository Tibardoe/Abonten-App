#!/usr/bin/env node
// Every translation catalog has exactly the keys the English one has, and
// every catalog file is sound.
//
// next-intl has no fallback locale here (packages/i18n/src/catalog.ts loads
// one locale's files and nothing else), so a key missing from, say, the
// French catalog shows its raw path -- "navigation.create" -- to everyone
// reading in French. On 2026-09-27 the renamed "create" nav key and ten
// phone-security keys were missing from all five other locales.
//
// Two more faults are caught because each lost real messages once
// (2026-10-01): a key written twice in one object (JSON.parse keeps only
// the last, silently), and a key that is both a message and a group
// ("appearance": "Appearance" beside "appearance": { "title": … }).
//
// Run: node scripts/check-i18n.mjs

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MESSAGES = fileURLToPath(
  new URL("../packages/i18n/messages", import.meta.url),
);
const BASE = "en";
const problems = [];

function flatten(value, prefix = "") {
  return Object.entries(value).flatMap(([key, child]) =>
    child && typeof child === "object" && !Array.isArray(child)
      ? flatten(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

// A small JSON reader that reports a key written twice in the same object,
// which JSON.parse cannot do.
function duplicateKeys(text, label) {
  let i = 0;
  const found = [];
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const str = () => {
    // at opening quote
    let out = "";
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\") {
        out += text[i] + text[i + 1];
        i += 2;
      } else out += text[i++];
    }
    i++;
    return out;
  };
  const value = (path) => {
    ws();
    const c = text[i];
    if (c === "{") {
      i++;
      const seen = new Set();
      ws();
      if (text[i] === "}") {
        i++;
        return;
      }
      for (;;) {
        ws();
        const key = str();
        if (seen.has(key))
          found.push(`${label}: "${[...path, key].join(".")}" appears twice`);
        seen.add(key);
        ws();
        i++; // :
        value([...path, key]);
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        i++; // }
        return;
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (text[i] === "]") {
        i++;
        return;
      }
      for (;;) {
        value(path);
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        i++; // ]
        return;
      }
    }
    if (c === '"') {
      str();
      return;
    }
    while (i < text.length && !/[,\]}]/.test(text[i])) i++; // number/true/null
  };
  value([]);
  return found;
}

function keysOf(locale, file) {
  const text = readFileSync(join(MESSAGES, locale, file), "utf8");
  problems.push(...duplicateKeys(text, `${locale}/${file}`));
  const keys = new Set(flatten(JSON.parse(text)));
  for (const key of keys) {
    const parts = key.split(".");
    for (let n = 1; n < parts.length; n++) {
      const prefix = parts.slice(0, n).join(".");
      if (keys.has(prefix)) {
        problems.push(
          `${locale}/${file}: "${prefix}" is both a message and a group (${key})`,
        );
      }
    }
  }
  return keys;
}

const locales = readdirSync(MESSAGES).filter((name) => name !== BASE);
const files = readdirSync(join(MESSAGES, BASE)).filter((name) =>
  name.endsWith(".json"),
);

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
