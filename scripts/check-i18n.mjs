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
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The parser the apps format with (use-intl → intl-messageformat), found
// from the package that depends on it so hoisting cannot hide it.
const requireFromI18n = createRequire(
  fileURLToPath(new URL("../packages/i18n/package.json", import.meta.url)),
);
const requireFromUseIntl = createRequire(requireFromI18n.resolve("use-intl"));
const requireFromFormat = createRequire(
  requireFromUseIntl.resolve("intl-messageformat"),
);
const { parse: parseIcu } = requireFromFormat(
  "@formatjs/icu-messageformat-parser",
);

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

// ── every message is valid ICU and takes the values English takes ──
//
// A message that does not parse shows its key path to a real person, and a
// translation that names a value the code does not pass ("{nombre}" for
// "{name}") throws when it is formatted. Both are checked here for every
// locale: the argument names and the rich-text tags must be English's.

function valuesOf(message, label) {
  let ast;
  try {
    ast = parseIcu(message, { ignoreTag: false });
  } catch (error) {
    problems.push(`${label}: not valid ICU (${error.message})`);
    return null;
  }
  const names = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      // 0 literal, 1 argument, 2 number, 3 date, 4 time, 5 select,
      // 6 plural, 7 pound, 8 tag
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

function messagesOf(locale, file) {
  const out = {};
  const walk = (value, prefix) => {
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === "object") walk(child, `${prefix}${key}.`);
      else out[`${prefix}${key}`] = String(child);
    }
  };
  walk(JSON.parse(readFileSync(join(MESSAGES, locale, file), "utf8")), "");
  return out;
}

let parsed = 0;
for (const file of files) {
  const english = messagesOf(BASE, file);
  const expected = {};
  for (const [key, message] of Object.entries(english)) {
    parsed++;
    expected[key] = valuesOf(message, `${BASE}/${file}: "${key}"`);
  }
  for (const locale of locales) {
    let translated;
    try {
      translated = messagesOf(locale, file);
    } catch {
      continue; // reported above as a missing file
    }
    for (const [key, message] of Object.entries(translated)) {
      if (!(key in english)) continue;
      parsed++;
      const given = valuesOf(message, `${locale}/${file}: "${key}"`);
      const wanted = expected[key];
      if (!given || !wanted) continue;
      const unknown = [...given].filter((name) => !wanted.has(name));
      const dropped = [...wanted].filter(
        (name) => name.startsWith("<") && !given.has(name),
      );
      if (unknown.length) {
        problems.push(
          `${locale}/${file}: "${key}" uses ${unknown.join(", ")}, which the English message does not take`,
        );
      }
      if (dropped.length) {
        problems.push(
          `${locale}/${file}: "${key}" drops the tag ${dropped.join(", ")}`,
        );
      }
    }
  }
}

if (problems.length) {
  console.error("Translation catalogs disagree with English:");
  for (const line of problems) console.error(`  ${line}`);
  process.exit(1);
}
console.log(
  `i18n: ${locales.length} locales match ${BASE} across ${files.length} files; ${parsed} messages are valid ICU.`,
);
