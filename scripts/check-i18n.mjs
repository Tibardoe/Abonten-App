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
// And a finished language shows nothing in English (see the last section):
// before 2026-10-01 a person who chose French read most of the app in
// English, because new sentences reached the catalogs untranslated.
//
// And a translation is of the English it was made from (the section after
// that): when an English message is reworded, its translations are looked
// at again before the change ships.
//
// Run: node scripts/check-i18n.mjs

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
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
  // The values the message words differently by: "count (plural)",
  // "kind (select)".
  names.branches = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      // 0 literal, 1 argument, 2 number, 3 date, 4 time, 5 select,
      // 6 plural, 7 pound, 8 tag
      if (node.type === 0 || node.type === 7) continue;
      names.add(node.type === 8 ? `<${node.value}>` : node.value);
      if (node.type === 6) names.branches.add(`${node.value} (plural)`);
      if (node.type === 5) names.branches.add(`${node.value} (select)`);
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
      // Where English says it one way for one and another way for many
      // ("# request" / "# requests"), or names the thing by a code
      // ({kind, select, place {…} other {…}}), the translation must do the
      // same: printing the bare value gave "3 demande" and "Supprimer
      // cette video" on 2026-10-01, after English had moved to these forms.
      const flattened = [...wanted.branches].filter(
        (branch) => !given.branches.has(branch),
      );
      if (flattened.length) {
        problems.push(
          `${locale}/${file}: "${key}" prints ${flattened.join(", ")} as it comes; English words it by that value, so must the translation`,
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

// ── a finished language leaves nothing in English ──
//
// A new English sentence is copied into every catalog so no key is missing,
// which also means it SHOWS in English to someone reading French until it is
// translated. For every language not listed as partial in locales.json, a
// value that still equals the English one must either be translated or be
// recorded in same-as-english.json as a word that really is the same there
// ("Total", "Menu", a brand name).
//
//   node scripts/check-i18n.mjs --accept-same    record what is the same now

const registry = JSON.parse(
  readFileSync(
    new URL("../packages/i18n/src/locales.json", import.meta.url),
    "utf8",
  ),
);
const SAME_FILE = fileURLToPath(
  new URL("../packages/i18n/same-as-english.json", import.meta.url),
);
const ACCEPT = process.argv.includes("--accept-same");
const finished = locales.filter((locale) => !registry.partial.includes(locale));

// The words of a message: its literal text, including inside plural and
// select branches, without the values and the tags.
function wordsOf(message) {
  let ast;
  try {
    ast = parseIcu(message, { ignoreTag: false });
  } catch {
    return message;
  }
  let text = "";
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 0) text += `${node.value} `;
      if (node.options)
        for (const option of Object.values(node.options)) walk(option.value);
      if (node.children) walk(node.children);
    }
  };
  walk(ast);
  return text;
}

let recorded = {};
try {
  recorded = JSON.parse(readFileSync(SAME_FILE, "utf8"));
} catch {
  recorded = {};
}
const same = {};
const untranslated = [];
for (const locale of finished) {
  const allowed = new Set(recorded[locale] ?? []);
  same[locale] = [];
  for (const file of files) {
    const ns = file.replace(/\.json$/, "");
    const english = messagesOf(BASE, file);
    const translated = messagesOf(locale, file);
    for (const [key, message] of Object.entries(english)) {
      if (translated[key] !== message) continue;
      // Nothing to translate: a number, a symbol, values only.
      if (!/\p{L}{2,}/u.test(wordsOf(message))) continue;
      const ref = `${ns}:${key}`;
      same[locale].push(ref);
      if (!allowed.has(ref))
        untranslated.push(`${locale}/${file}: "${key}" = ${message}`);
    }
  }
  same[locale].sort();
}

// ── a translation is of the English it was made from ──
//
// On 2026-10-01 twenty-nine English messages had been reworded ("{n}
// request" became a plural, "Delete this {kind}" a select) and their
// translations had not: French read "3 demande" and "Supprimer cette
// video", and four sentences were English again. Nothing noticed, because
// each translation still differed from the new English.
//
// source-english.json records, for every message, a fingerprint of the
// English its translations were written from. Change the English, and the
// check fails until the translations have been looked at again:
//
//   node scripts/check-i18n.mjs --accept-source    after updating them

const SOURCE_FILE = fileURLToPath(
  new URL("../packages/i18n/source-english.json", import.meta.url),
);
const ACCEPT_SOURCE = process.argv.includes("--accept-source");
const fingerprint = (text) =>
  createHash("sha1").update(text).digest("hex").slice(0, 8);

const sourceNow = {};
for (const file of files) {
  const ns = file.replace(/\.json$/, "");
  sourceNow[ns] = {};
  for (const [key, message] of Object.entries(messagesOf(BASE, file))) {
    sourceNow[ns][key] = fingerprint(message);
  }
}
let sourceThen = {};
try {
  sourceThen = JSON.parse(readFileSync(SOURCE_FILE, "utf8"));
} catch {
  sourceThen = {};
}
const reworded = [];
const unrecorded = [];
let forgotten = 0;
for (const [ns, keys] of Object.entries(sourceNow)) {
  for (const [key, hash] of Object.entries(keys)) {
    const before = sourceThen[ns]?.[key];
    if (before === undefined) unrecorded.push(`${ns}:${key}`);
    else if (before !== hash) reworded.push(`${ns}:${key}`);
  }
}
for (const [ns, keys] of Object.entries(sourceThen)) {
  for (const key of Object.keys(keys)) {
    if (sourceNow[ns]?.[key] === undefined) forgotten++;
  }
}

function finishSource() {
  if (ACCEPT_SOURCE) {
    writeFileSync(SOURCE_FILE, `${JSON.stringify(sourceNow, null, 2)}\n`);
    console.log(
      `i18n: recorded the English of ${Object.values(sourceNow).reduce((n, keys) => n + Object.keys(keys).length, 0)} messages as what their translations were made from.`,
    );
    return;
  }
  if (reworded.length || unrecorded.length || forgotten) {
    if (reworded.length) {
      console.error(
        `${reworded.length} English messages were reworded after they were translated:`,
      );
      for (const ref of reworded.slice(0, 60)) console.error(`  ${ref}`);
      if (reworded.length > 60)
        console.error(`  … and ${reworded.length - 60} more`);
    }
    if (unrecorded.length) {
      console.error(
        `${unrecorded.length} messages are new since the translations were last confirmed${unrecorded.length <= 20 ? `: ${unrecorded.join(", ")}` : ""}.`,
      );
    }
    if (forgotten) {
      console.error(
        `${forgotten} recorded messages no longer exist in the catalogs.`,
      );
    }
    console.error(
      [
        "",
        `Check each one in ${finished.join(", ")} (does the translation still say what the English now says?), then:`,
        "  node scripts/check-i18n.mjs --accept-source",
      ].join("\n"),
    );
    process.exit(1);
  }
  console.log(
    "i18n: every translation is of the English it was made from.",
  );
}

if (ACCEPT) {
  writeFileSync(SAME_FILE, `${JSON.stringify(same, null, 2)}\n`);
  const total = Object.values(same).reduce((n, refs) => n + refs.length, 0);
  console.log(
    `i18n: recorded ${total} values as the same as English in ${finished.join(", ")}.`,
  );
} else if (untranslated.length) {
  console.error(
    `${untranslated.length} messages still show in English to people reading ${finished.join(", ")}:`,
  );
  for (const line of untranslated.slice(0, 60)) console.error(`  ${line}`);
  if (untranslated.length > 60)
    console.error(`  … and ${untranslated.length - 60} more`);
  console.error(
    [
      "",
      "Translate them:",
      `  node scripts/i18n/translation-units.mjs export --out <dir> --untranslated ${finished.join(",")}`,
      "  (write <dir>/<locale>-01.txt, then: … import --locale <locale> --in <dir>)",
      "or, for a word that really is the same in that language:",
      "  node scripts/check-i18n.mjs --accept-same",
    ].join("\n"),
  );
  process.exit(1);
} else {
  const total = Object.values(same).reduce((n, refs) => n + refs.length, 0);
  console.log(
    `i18n: nothing is left in English in ${finished.join(", ")} (${total} values recorded as the same word); partly translated: ${registry.partial.join(", ") || "none"}.`,
  );
}

finishSource();
