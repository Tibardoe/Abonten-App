#!/usr/bin/env node
// The translation hand-off. English is the source: this exports what a
// locale still shows in English as numbered units, and imports the
// translated units back into that locale's catalogs after checking each one
// still carries the same placeholders, plural/select branches and tags.
//
//   node scripts/i18n/translation-units.mjs export --out <dir> [--size 300]
//       <dir>/units-NN.txt     one unit per line:  id|English text
//       <dir>/units.json       id → { text, keys: ["ns:key.path", …] }
//
//   node scripts/i18n/translation-units.mjs import --locale fr --in <dir>
//       reads <dir>/<locale>-NN.txt  (id|translation, same ids), writes
//       packages/i18n/messages/<locale>/*.json, reports what it refused.
//
// A unit is one distinct English sentence; every key that says it gets the
// same translation. Where one English word needs two translations ("Open"
// the door / "Open" now), give that key its own line:  id@ns:key|…
//
// A line break inside a message is written as the two characters \n.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MESSAGES = fileURLToPath(
  new URL("../../packages/i18n/messages", import.meta.url),
);
const args = process.argv.slice(2);
const mode = args[0];
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const files = readdirSync(join(MESSAGES, "en"))
  .filter((f) => f.endsWith(".json"))
  .sort();

function flatten(value, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(value)) {
    if (v && typeof v === "object") flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
  cur[parts[parts.length - 1]] = value;
}

const read = (locale, file) =>
  JSON.parse(readFileSync(join(MESSAGES, locale, file), "utf8"));

// Text that is the same in every language: codes, names, bare values.
function staysAsIs(ns, key, text) {
  if (!/\p{L}{2,}/u.test(text.replace(/\{[^{}]*\}/g, ""))) return true;
  if (/^[a-z]+(_[a-z0-9]+)+$/.test(text)) return true; // an error code
  if (ns === "server" && key.startsWith("db.") && /append-only$/.test(text))
    return true; // a table's own guard, read by engineers
  if (ns === "server" && /^[a-zA-Z]+ is required$/.test(text)) return true; // an API field name
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(text)) return true; // a sample mailbox
  return false;
}

/** Every English unit, in catalog order, with the keys that say it. */
function englishUnits() {
  const byText = new Map();
  for (const file of files) {
    const ns = file.replace(/\.json$/, "");
    for (const [key, text] of Object.entries(flatten(read("en", file)))) {
      if (typeof text !== "string" || staysAsIs(ns, key, text)) continue;
      const unit = byText.get(text) ?? { text, keys: [] };
      unit.keys.push(`${ns}:${key}`);
      byText.set(text, unit);
    }
  }
  return [...byText.values()];
}

// ── what a translation must keep ─────────────────────────────────────

/** The arguments of an ICU message with their kind and branch names. */
function shape(message) {
  const out = [];
  let i = 0;
  const walk = () => {
    while (i < message.length) {
      const c = message[i];
      if (c === "'" && message[i + 1] === "{") {
        // quoted literal brace
        const end = message.indexOf("'", i + 2);
        i = end === -1 ? message.length : end + 1;
        continue;
      }
      if (c === "}") return;
      if (c !== "{") {
        i++;
        continue;
      }
      i++;
      let name = "";
      while (i < message.length && /[^,{}]/.test(message[i]))
        name += message[i++];
      name = name.trim();
      if (message[i] === "}") {
        out.push(name);
        i++;
        continue;
      }
      // {name, kind, …}
      i++;
      let kind = "";
      while (i < message.length && /[^,{}]/.test(message[i]))
        kind += message[i++];
      kind = kind.trim();
      const branches = [];
      if (message[i] === ",") i++;
      while (i < message.length && message[i] !== "}") {
        let label = "";
        while (i < message.length && /[^{}]/.test(message[i]))
          label += message[i++];
        label = label.trim();
        if (message[i] === "{") {
          if (label) branches.push(label);
          i++;
          walk();
          i++; // the branch's closing brace
        }
      }
      i++;
      // A language may add plural categories (few, many) but must keep the
      // exact ones (=0) and every select branch.
      const kept =
        kind === "plural" || kind === "selectordinal"
          ? branches.filter((b) => b.startsWith("="))
          : branches;
      out.push(`${name}:${kind}:${[...kept].sort().join("/")}`);
    }
  };
  walk();
  return out.sort().join(" ");
}

const tags = (message) =>
  [...message.matchAll(/<\/?([a-zA-Z][\w-]*)\s*\/?>/g)]
    .map((m) => m[0])
    .sort()
    .join(" ");

function problem(english, translated) {
  if (!translated.trim()) return "empty";
  if (shape(english) !== shape(translated)) {
    return `placeholders differ: ${shape(english)} ≠ ${shape(translated)}`;
  }
  if (tags(english) !== tags(translated)) return "tags differ";
  const edge = (s) => [/^\s/.test(s), /\s$/.test(s)].join();
  if (edge(english) !== edge(translated))
    return "leading/trailing space differs";
  return null;
}

const encode = (text) => text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
const decode = (text) =>
  text.replace(/\\(\\|n)/g, (_, c) => (c === "n" ? "\n" : "\\"));

// ── export ───────────────────────────────────────────────────────────

if (mode === "export") {
  const out = resolve(option("out") ?? "translation-units");
  const size = Number(option("size") ?? 300);
  mkdirSync(out, { recursive: true });
  const units = englishUnits();
  const index = {};
  units.forEach((unit, i) => {
    index[i + 1] = unit;
  });
  writeFileSync(join(out, "units.json"), `${JSON.stringify(index, null, 1)}\n`);
  let n = 0;
  for (let start = 0; start < units.length; start += size) {
    n++;
    const lines = units.slice(start, start + size).map((unit, j) => {
      const id = start + j + 1;
      // A short unit says where it is used: one word can mean two things.
      const where =
        unit.text.split(/\s+/).length <= 2
          ? `  ⟦${unit.keys.slice(0, 3).join(", ")}⟧`
          : "";
      return `${id}|${encode(unit.text)}${where}`;
    });
    writeFileSync(
      join(out, `units-${String(n).padStart(2, "0")}.txt`),
      `${lines.join("\n")}\n`,
    );
  }
  // What each locale had already translated before this hand-off is kept
  // as it is: the import never writes over a reviewed translation.
  for (const locale of readdirSync(MESSAGES)) {
    if (locale === "en" || locale.includes(".")) continue;
    const kept = [];
    for (const file of files) {
      const ns = file.replace(/\.json$/, "");
      const en = flatten(read("en", file));
      for (const [key, text] of Object.entries(flatten(read(locale, file)))) {
        if (en[key] !== undefined && text !== en[key])
          kept.push(`${ns}:${key}`);
      }
    }
    const path = join(out, `kept-${locale}.json`);
    if (!existsSync(path))
      writeFileSync(
        path,
        `${JSON.stringify(kept)}
`,
      );
  }
  console.log(`${units.length} units in ${n} files → ${out}`);
  process.exit(0);
}

// ── import ───────────────────────────────────────────────────────────

if (mode === "import") {
  const locale = option("locale");
  const dir = resolve(option("in") ?? "translation-units");
  if (!locale || !existsSync(join(MESSAGES, locale))) {
    console.error("import needs --locale <an existing locale>");
    process.exit(2);
  }
  const index = JSON.parse(readFileSync(join(dir, "units.json"), "utf8"));
  const catalogs = Object.fromEntries(files.map((f) => [f, read(locale, f)]));
  const english = Object.fromEntries(
    files.map((f) => [f, flatten(read("en", f))]),
  );

  const keptPath = join(dir, `kept-${locale}.json`);
  const kept = new Set(
    existsSync(keptPath) ? JSON.parse(readFileSync(keptPath, "utf8")) : [],
  );

  let written = 0;
  let units = 0;
  const refused = [];
  const seen = new Set();
  const inputs = readdirSync(dir)
    .filter((f) => f.startsWith(`${locale}-`) && f.endsWith(".txt"))
    .sort();
  for (const input of inputs) {
    const lines = readFileSync(join(dir, input), "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim() || line.startsWith("#")) continue;
      const bar = line.indexOf("|");
      if (bar === -1) {
        refused.push(`${input}: no "|" in: ${line.slice(0, 60)}`);
        continue;
      }
      const [id, only] = line.slice(0, bar).split("@");
      const translated = decode(line.slice(bar + 1));
      const unit = index[id.trim()];
      if (!unit) {
        refused.push(`${input}: unknown unit ${id}`);
        continue;
      }
      const why = problem(unit.text, translated);
      if (why) {
        refused.push(
          `${input}: ${id} ${why}\n    en: ${unit.text}\n    ${locale}: ${translated}`,
        );
        continue;
      }
      if (!only) {
        units++;
        seen.add(id.trim());
      }
      for (const ref of unit.keys) {
        if (only && ref !== only.trim()) continue;
        if (kept.has(ref) && !only) continue;
        const [ns, key] = [
          ref.slice(0, ref.indexOf(":")),
          ref.slice(ref.indexOf(":") + 1),
        ];
        const file = `${ns}.json`;
        // English changed since the export: the unit no longer applies.
        if (english[file]?.[key] !== unit.text) continue;
        setPath(catalogs[file], key, translated);
        written++;
      }
    }
  }
  for (const file of files) {
    writeFileSync(
      join(MESSAGES, locale, file),
      `${JSON.stringify(catalogs[file], null, 2)}\n`,
    );
  }
  const missing = Object.keys(index).filter((id) => !seen.has(id));
  console.log(
    `${locale}: ${units} units → ${written} messages written; ${refused.length} refused; ${missing.length} units not translated yet.`,
  );
  if (refused.length) console.log(refused.join("\n"));
  if (missing.length && args.includes("--missing")) {
    console.log(`missing: ${missing.join(" ")}`);
  }
  process.exit(refused.length ? 1 : 0);
}

console.error("usage: translation-units.mjs export|import …");
process.exit(2);
