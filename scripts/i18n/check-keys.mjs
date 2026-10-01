#!/usr/bin/env node
// Every key the code asks a translator for must exist in the English
// catalog of the namespace that translator was made for. A missing key is
// not a type error and not a crash: the screen shows "common.saveChanges"
// to a real person. This finds them before a release does.
//
//   node scripts/i18n/check-keys.mjs            # report
//   node scripts/i18n/check-keys.mjs --check    # CI: exit 1 on a missing key
//
// It follows a translator from where it is made to where it is called:
//
//   const t = useTranslations("events")          t("title")        → events
//   const tc = await getTranslations("core")     tc.rich("x", …)   → core
//   getTranslations({ locale, namespace: "x" })
//   translatorFor("common")                      (call-time translators)
//   tr("key")                                    → server
//   words.t("key") / emailT(locale)("key")       → emails / server
//
// A key built at run time (t(`status.${code}`)) is checked by its fixed
// prefix: at least one catalog key must start with it. A translator that
// arrives as a parameter (@abonten/core's helpers) is checked by that
// package's own tests with a strict translator.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MESSAGES = join(ROOT, "packages/i18n/messages/en");
const CHECK = process.argv.includes("--check");

const ROOTS = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/src",
  "apps/admin/src",
  "packages/ui-native/src",
  "packages/services/src",
  "packages/core/src",
];
const SKIP = ["node_modules", ".next", ".expo", "dist", "__integration__"];

// ── catalogs ─────────────────────────────────────────────────────────

const catalogs = {};
for (const file of readdirSync(MESSAGES)) {
  if (!file.endsWith(".json")) continue;
  const keys = new Set();
  const groups = new Set();
  const texts = new Map();
  const walk = (value, prefix) => {
    for (const [k, v] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") {
        groups.add(path);
        walk(v, path);
      } else {
        keys.add(path);
        texts.set(path, String(v));
      }
    }
  };
  walk(JSON.parse(readFileSync(join(MESSAGES, file), "utf8")), "");
  catalogs[file.replace(/\.json$/, "")] = { keys, groups, texts };
}

/** The values an ICU message needs: its arguments and its <tags>. */
function needs(message) {
  const names = new Set();
  let i = 0;
  // message := (text | '{' name [',' type [',' (selector '{' message '}')*]] '}')*
  const parseMessage = () => {
    while (i < message.length) {
      const c = message[i];
      if (c === "'" && (message[i + 1] === "{" || message[i + 1] === "}")) {
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
      while (i < message.length && !",{}".includes(message[i])) {
        name += message[i++];
      }
      if (name.trim()) names.add(name.trim());
      if (message[i] === "}") {
        i++;
        continue;
      }
      i++; // ","
      while (i < message.length && !",{}".includes(message[i])) i++; // type
      if (message[i] === ",") {
        i++;
        // options: selector {message} …   (or a number/date skeleton)
        while (i < message.length && message[i] !== "}") {
          if (message[i] === "{") {
            i++;
            parseMessage();
            i++; // the branch's "}"
          } else i++;
        }
      }
      i++; // the argument's "}"
    }
  };
  parseMessage();
  for (const tag of message.matchAll(/<([A-Za-z][\w-]*)\s*\/?>/g)) {
    names.add(tag[1]);
  }
  return names;
}

/** The property names of an object literal, or null when it is not one. */
function givenNames(arg) {
  if (!arg) return new Set();
  if (!ts.isObjectLiteralExpression(arg)) return null; // a variable: unknown
  const names = new Set();
  for (const p of arg.properties) {
    if (ts.isSpreadAssignment(p)) return null;
    if (
      ts.isPropertyAssignment(p) ||
      ts.isShorthandPropertyAssignment(p) ||
      ts.isMethodDeclaration(p)
    ) {
      const name = p.name;
      if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) {
        names.add(name.text);
      } else return null; // computed
    }
  }
  return names;
}

// ── which namespace a translator speaks ──────────────────────────────

const FACTORIES = new Set([
  "useTranslations",
  "getTranslations",
  "translatorFor",
  "serverTranslator",
]);

/** `useTranslations("ns")`, `await getTranslations({ namespace: "ns" })`… */
function namespaceOfFactory(node) {
  let call = node;
  while (
    call &&
    (ts.isAwaitExpression(call) ||
      ts.isParenthesizedExpression(call) ||
      ts.isAsExpression(call) ||
      ts.isNonNullExpression(call))
  ) {
    call = call.expression;
  }
  if (!call || !ts.isCallExpression(call)) return null;
  const callee = call.expression.getText();
  const name = callee.split(".").pop();
  if (name === "emailT") return "emails";
  if (name === "trFor") return "server";
  if (name === "coreT" || name === "coreTFor" || name === "coreTranslator")
    return "core";
  if (!FACTORIES.has(name)) return null;
  // serverTranslator(locale, "ns")
  const args = call.arguments;
  if (name === "serverTranslator") {
    const ns = args[1];
    return ns && ts.isStringLiteralLike(ns) ? ns.text : null;
  }
  const first = args[0];
  if (!first) return ""; // the whole catalog: keys carry their namespace
  if (ts.isStringLiteralLike(first)) return first.text;
  if (ts.isObjectLiteralExpression(first)) {
    for (const p of first.properties) {
      if (
        ts.isPropertyAssignment(p) &&
        p.name.getText() === "namespace" &&
        ts.isStringLiteralLike(p.initializer)
      ) {
        return p.initializer.text;
      }
    }
  }
  return null;
}

/** The declaration of `name` visible from `node`, innermost scope first. */
function findBinding(name, node) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    const statements = ts.isSourceFile(scope)
      ? scope.statements
      : ts.isBlock(scope) || ts.isModuleBlock(scope)
        ? scope.statements
        : ts.isCaseClause(scope) || ts.isDefaultClause(scope)
          ? scope.statements
          : null;
    if (statements) {
      for (const st of statements) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) {
          if (ts.isIdentifier(d.name) && d.name.text === name) return d;
        }
      }
    }
    // a parameter of the enclosing function shadows anything outside it
    if (ts.isFunctionLike(scope)) {
      for (const p of scope.parameters) {
        if (ts.isIdentifier(p.name) && p.name.text === name) return p;
        if (ts.isObjectBindingPattern(p.name)) {
          for (const el of p.name.elements) {
            if (ts.isIdentifier(el.name) && el.name.text === name) return p;
          }
        }
      }
    }
  }
  return null;
}

const METHODS = new Set(["rich", "markup", "raw", "has"]);

function keyArgument(arg) {
  if (!arg) return null;
  if (ts.isStringLiteralLike(arg)) return { key: arg.text, exact: true };
  if (ts.isTemplateExpression(arg)) {
    return { key: arg.head.text, exact: false };
  }
  return null;
}

// ── scan ─────────────────────────────────────────────────────────────

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
      out.push(p);
  }
  return out;
}

const missing = [];
let checked = 0;

for (const abs of ROOTS.flatMap((r) => walk(join(ROOT, r), []))) {
  const file = relative(ROOT, abs).split(sep).join("/");
  if (file.includes(".test.")) continue;
  const source = readFileSync(abs, "utf8");
  if (!/Translations|translatorFor|\btr\(|emailT|trFor|coreT/.test(source))
    continue;
  const sf = ts.createSourceFile(
    abs,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const report = (node, namespace, givenKey, exact, valuesArg, method) => {
    // useTranslations("settings.security.phone"): a group inside a catalog
    const [ns, ...group] = namespace.split(".");
    const key = group.length ? `${group.join(".")}.${givenKey}` : givenKey;
    const catalog = catalogs[ns];
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (!catalog) {
      missing.push({ file, line, ns, key, why: "no such namespace" });
      return;
    }
    checked++;
    if (exact) {
      if (!catalog.keys.has(key)) {
        missing.push({
          file,
          line,
          ns,
          key,
          why: catalog.groups.has(key)
            ? "is a group, not a message"
            : "missing",
        });
        return;
      }
      // t.has() and t.raw() read the message without formatting it.
      if (method === "has" || method === "raw") return;
      const given = givenNames(valuesArg);
      if (given) {
        const absent = [...needs(catalog.texts.get(key))].filter(
          (name) => !given.has(name),
        );
        if (absent.length) {
          missing.push({
            file,
            line,
            ns,
            key,
            why: `the message needs {${absent.join("}, {")}} and the call does not give it`,
          });
        }
      }
      return;
    }
    if (!key) return; // wholly dynamic
    const hit = [...catalog.keys].some((k) => k.startsWith(key));
    if (!hit)
      missing.push({
        file,
        line,
        ns,
        key: `${key}…`,
        why: "no key starts with",
      });
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      let callee = node.expression;
      let method = null;
      if (
        ts.isPropertyAccessExpression(callee) &&
        METHODS.has(callee.name.text)
      ) {
        method = callee.name.text;
        callee = callee.expression;
      }
      const valuesArg = node.arguments[1];
      const arg = keyArgument(node.arguments[0]);
      if (arg) {
        let ns = null;
        if (ts.isIdentifier(callee)) {
          if (callee.text === "tr") {
            const binding = findBinding("tr", node);
            // the imported tr() of the services; a local `tr` is followed
            ns = binding ? namespaceOfInitializer(binding) : "server";
          } else {
            const binding = findBinding(callee.text, node);
            ns = binding ? namespaceOfInitializer(binding) : null;
          }
        } else if (ts.isCallExpression(callee)) {
          // coreT()("key"), emailT(locale)("key"), translatorFor("ns")("key")
          ns = namespaceOfFactory(callee);
        }
        if (ns !== null && ns !== undefined) {
          if (ns === "") {
            const dot = arg.key.indexOf(".");
            if (dot > 0) {
              report(
                node,
                arg.key.slice(0, dot),
                arg.key.slice(dot + 1),
                arg.exact,
                valuesArg,
                method,
              );
            }
          } else report(node, ns, arg.key, arg.exact, valuesArg, method);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  function namespaceOfInitializer(decl) {
    if (!ts.isVariableDeclaration(decl) || !decl.initializer) return null;
    return namespaceOfFactory(decl.initializer);
  }

  visit(sf);
}

if (missing.length === 0) {
  console.log(
    `i18n keys: ${checked} lookups, every key exists and gets its values.`,
  );
  process.exit(0);
}

for (const m of missing) {
  console.log(`${m.file}:${m.line}  ${m.ns}.${m.key}  — ${m.why}`);
}
console.log(
  `\n${missing.length} of ${checked} lookups name a key the English catalog does not have, or leave out a value its message needs.`,
);
process.exit(CHECK ? 1 : 0);
