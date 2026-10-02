#!/usr/bin/env node
// A sentence must be one message. Code that glues a sentence together from
// pieces decides the word order and the grammar for every language at once:
//
//   {count} {count === 1 ? t("pick") : t("picks")} {t("thisWeek")}
//
// reads "3 picks this week" in English and cannot be said properly in any
// language that puts the words in another order, declines the noun, or has
// other plural rules (French says "0 choix" in the singular form). The
// message has to take the number and say the whole thing:
//
//   t("picksThisWeek", { count })      "{count, plural, one {# pick this week} other {# picks this week}}"
//
// This finds the three ways a sentence gets glued:
//
//   plural by hand       n === 1 ? t("one") : t("many")
//   words side by side   {t("a")} {t("b")}, {n} {t("items")}, {t("by")} {name}
//   words in a string    `${t("a")} ${name}`, t("a") + " " + t("b")
//   piece of a sentence  a catalog message that starts or ends with a space
//                        or starts with a comma: " and your documents"
//
// Punctuation between two values is not a sentence ("{label}: {value}",
// "{a} · {b}") and is left alone.
//
//   node scripts/i18n/check-fragments.mjs            # report
//   node scripts/i18n/check-fragments.mjs --check    # CI: exit 1 on any

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CHECK = process.argv.includes("--check");
const ROOTS = [
  "apps/web/src",
  "apps/mobile/app",
  "apps/mobile/src",
  "packages/ui-native/src",
];
const SKIP = ["node_modules", ".next", ".expo", "dist"];

// scripts/i18n/fragment-allowlist.json: the few places that only look like
// a glued sentence, each with the reason it is not one.
//   { "code": [{ "file", "text", "why" }], "messages": [{ "ref", "why" }] }
const allowlist = (() => {
  try {
    return JSON.parse(
      readFileSync(join(ROOT, "scripts/i18n/fragment-allowlist.json"), "utf8"),
    );
  } catch {
    return {};
  }
})();
const allowedCode = new Set(
  (allowlist.code ?? []).map((entry) => `${entry.file}::${entry.text}`),
);

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(entry.name)) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name))
      out.push(p);
  }
  return out;
}

const TRANSLATOR = /^(t|tc|tv|tr|tt|translate)$|^t[A-Z]/;

// Every English message by its key, whatever namespace it is in: enough to
// tell whether t("key") is a whole sentence.
const EN = join(ROOT, "packages/i18n/messages/en");
const english = new Map(); // key path -> [texts]
const catalogs = [];
for (const name of readdirSync(EN)) {
  if (!name.endsWith(".json")) continue;
  const namespace = name.replace(/\.json$/, "");
  const walkMessages = (value, prefix) => {
    for (const [key, inner] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (inner && typeof inner === "object") {
        walkMessages(inner, path);
        continue;
      }
      const text = String(inner);
      catalogs.push({ namespace, name, path, text });
      const list = english.get(path) ?? [];
      list.push(text);
      english.set(path, list);
    }
  };
  walkMessages(JSON.parse(readFileSync(join(EN, name), "utf8")), "");
}
const endsASentence = (text) => /[.!?…][)"”’]?$/.test(text.trim());

/**
 * A whole sentence: t("key") whose English ends in a full stop, a choice
 * between such sentences, or `fromTheServer ?? t("key")`. Two of those
 * side by side are two sentences, which every language can say in order.
 */
function isSentence(input) {
  const node = unwrap(input);
  if (!node) return false;
  if (ts.isStringLiteralLike(node)) return node.text === "";
  if (node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isTemplateExpression(node)) {
    // ` ${t("key")}`: a sentence after a space
    return (
      node.templateSpans.length === 1 &&
      /^\s*$/.test(node.head.text) &&
      node.templateSpans[0].literal.text === "" &&
      isSentence(node.templateSpans[0].expression)
    );
  }
  if (ts.isConditionalExpression(node)) {
    return isSentence(node.whenTrue) && isSentence(node.whenFalse);
  }
  if (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  ) {
    return isSentence(node.right);
  }
  if (ts.isCallExpression(node) && isWords(node)) {
    const key = node.arguments[0];
    if (!key || !ts.isStringLiteralLike(key)) return false;
    const leaf = key.text;
    const texts = [...english.entries()]
      .filter(([path]) => path === leaf || path.endsWith(`.${leaf}`))
      .flatMap(([, list]) => list);
    return texts.length > 0 && texts.every(endsASentence);
  }
  return false;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

/** The `const name = …` a name refers to, looking outwards from `node`. */
function constantOf(identifier) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    const statements =
      ts.isSourceFile(scope) || ts.isBlock(scope) ? scope.statements : null;
    if (!statements) continue;
    for (const st of statements) {
      if (!ts.isVariableStatement(st)) continue;
      if (!(st.declarationList.flags & ts.NodeFlags.Const)) continue;
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === identifier.text) {
          return d.initializer ?? null;
        }
      }
    }
  }
  return null;
}

/** What a function written in the same file can return. */
function returnsOfLocal(identifier) {
  const sf = identifier.getSourceFile();
  let fn = null;
  const find = (node) => {
    if (fn) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === identifier.text) {
      fn = node;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier.text &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) ||
        ts.isFunctionExpression(node.initializer))
    ) {
      fn = node.initializer;
    }
    ts.forEachChild(node, find);
  };
  find(sf);
  if (!fn?.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) out.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return out;
}

/** t("key") or t("key", {...}) — words. (t.rich returns elements.) */
function isWords(input, depth = 0) {
  const node = unwrap(input);
  if (!node) return false;
  // const verb = sold ? t("ticketSoldFor") : t("newRegistrationFor");
  if (ts.isIdentifier(node) && depth < 3) {
    const value = constantOf(node);
    return value ? isWords(value, depth + 1) : false;
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && TRANSLATOR.test(callee.text)) return true;
    if (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      TRANSLATOR.test(callee.expression.text) &&
      callee.name.text === "markup"
    ) {
      return true;
    }
    // translatorFor("manage")("ticketSoldFor")
    if (
      ts.isCallExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === "translatorFor"
    ) {
      return true;
    }
    // activityVerb(type), written in this file and returning t("…")
    if (ts.isIdentifier(callee) && depth < 3) {
      return returnsOfLocal(callee).some((r) => isWords(r, depth + 1));
    }
    return false;
  }
  if (ts.isConditionalExpression(node)) {
    return isWords(node.whenTrue, depth) || isWords(node.whenFalse, depth);
  }
  return false;
}

// Between two values: only spaces means "these words follow each other".
const onlySpaces = (text) => /^[ \t\r\n ]*$/.test(text);

const findings = [];

for (const abs of ROOTS.flatMap((r) => walk(join(ROOT, r), []))) {
  const file = relative(ROOT, abs).split(sep).join("/");
  const source = readFileSync(abs, "utf8");
  if (!/\bt[A-Za-z]*\(/.test(source)) continue;
  const sf = ts.createSourceFile(
    abs,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const report = (node, kind) => {
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    const text = node.getText(sf).replace(/\s+/g, " ").slice(0, 110);
    if (allowedCode.has(`${file}::${text}`)) return;
    findings.push({ file, line: line + 1, kind, text });
  };

  const visit = (node) => {
    // n === 1 ? t("one") : t("many")
    if (ts.isConditionalExpression(node)) {
      const test = unwrap(node.condition);
      if (
        ts.isBinaryExpression(test) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.GreaterThanToken,
          ts.SyntaxKind.EqualsEqualsToken,
        ].includes(test.operatorToken.kind) &&
        ts.isNumericLiteral(test.right) &&
        test.right.text === "1" &&
        // a wizard's first step is not "one of something"
        !/step|page|index|stage|tab/i.test(test.left.getText(sf)) &&
        isWords(node.whenTrue) &&
        isWords(node.whenFalse)
      ) {
        report(node, "plural by hand");
      }
    }

    // {a} {t("b")}
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const children = node.children;
      for (let i = 0; i < children.length; i++) {
        const first = children[i];
        if (!ts.isJsxExpression(first) || !first.expression) continue;
        // skip {" "} separators to the next value
        let j = i + 1;
        let glue = "";
        while (j < children.length) {
          const next = children[j];
          // JSX drops whitespace that holds a line break: {a}⏎{b} renders
          // with nothing between, {a} {b} with a space.
          if (ts.isJsxText(next)) {
            glue += /^\s*$/.test(next.text) && next.text.includes("\n")
              ? ""
              : next.text;
          } else if (
            ts.isJsxExpression(next) &&
            next.expression &&
            ts.isStringLiteralLike(next.expression)
          ) {
            glue += next.expression.text;
          } else break;
          j++;
        }
        const second = children[j];
        if (
          !second ||
          !ts.isJsxExpression(second) ||
          !second.expression ||
          !onlySpaces(glue) ||
          glue.length === 0 // {a}{b} with nothing between: not prose
        ) {
          continue;
        }
        const a = first.expression;
        const b = second.expression;
        if (ts.isStringLiteralLike(a) || ts.isStringLiteralLike(b)) continue;
        // An icon or element next to words is layout, not a sentence.
        const isElement = (e) => {
          const u = unwrap(e);
          return (
            ts.isJsxElement(u) ||
            ts.isJsxSelfClosingElement(u) ||
            ts.isJsxFragment(u) ||
            (ts.isBinaryExpression(u) &&
              u.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) ||
            (ts.isConditionalExpression(u) && !isWords(u))
          );
        };
        if (isElement(a) || isElement(b)) continue;
        if (isSentence(a) && isSentence(b)) continue;
        if (isWords(a) || isWords(b)) report(first.parent === node ? first : node, "words side by side");
      }
    }

    // `${t("a")} ${name}`
    if (ts.isTemplateExpression(node)) {
      const spans = node.templateSpans;
      const pieces = [null, ...spans.map((s) => s.expression)];
      const texts = [node.head.text, ...spans.map((s) => s.literal.text)];
      for (let i = 1; i < pieces.length; i++) {
        const before = texts[i - 1];
        const after = texts[i];
        const prev = pieces[i - 1];
        const next = pieces[i + 1];
        if (!isWords(pieces[i])) {
          continue;
        }
        const gluedBefore = prev && onlySpaces(before) && before.length > 0;
        const gluedAfter = next && onlySpaces(after) && after.length > 0;
        if (gluedBefore || gluedAfter) {
          report(node, "words in a string");
          break;
        }
      }
    }

    // t("a") + " " + x
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      !(
        ts.isBinaryExpression(node.parent) &&
        node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
      )
    ) {
      const parts = [];
      const flatten = (n) => {
        const u = unwrap(n);
        if (
          ts.isBinaryExpression(u) &&
          u.operatorToken.kind === ts.SyntaxKind.PlusToken
        ) {
          flatten(u.left);
          flatten(u.right);
        } else parts.push(u);
      };
      flatten(node);
      for (let i = 0; i < parts.length; i++) {
        if (!isWords(parts[i])) continue;
        const space = (p) => p && ts.isStringLiteralLike(p) && onlySpaces(p.text) && p.text.length > 0;
        if (
          (space(parts[i + 1]) && parts[i + 2] && !ts.isStringLiteralLike(parts[i + 2])) ||
          (space(parts[i - 1]) && parts[i - 2] && !ts.isStringLiteralLike(parts[i - 2]))
        ) {
          report(node, "words in a string");
          break;
        }
      }
    }

    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// A message that starts or ends with a space, starts with a comma or a full
// stop, or starts in lower case and ends a sentence, is the tail of a
// sentence the code begins: " and your documents", ", including you",
// ". It can't be withdrawn.", "and their event has taken place.". A fact
// on a dotted line ("· Sold out", " · Edited") is a whole thing said after
// a separator, and is left alone.
const allowedMessages = new Set(
  (allowlist.messages ?? []).map((entry) => entry.ref),
);
for (const { namespace, name, path, text } of catalogs) {
  const isFact = /^\s*[·—]\s/.test(text) || /\s·$/.test(text);
  if (isFact) continue;
  const trimmed = text.trim();
  const dangling =
    /^\s|\s$/.test(text) ||
    /^[,;.:!?]/.test(trimmed) ||
    (/^\p{Ll}/u.test(trimmed) &&
      endsASentence(trimmed) &&
      /\s/.test(trimmed) &&
      !trimmed.startsWith("{"));
  const ref = `${namespace}:${path}`;
  if (dangling && !allowedMessages.has(ref)) {
    findings.push({
      file: `packages/i18n/messages/en/${name}`,
      line: 0,
      kind: "piece of a sentence",
      text: `${path} = ${JSON.stringify(text)}`,
    });
  }
}

if (findings.length === 0) {
  console.log("fragments: every sentence is one message.");
  process.exit(0);
}
const byKind = {};
for (const f of findings) {
  byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  console.log(`${f.file}:${f.line}  [${f.kind}]  ${f.text}`);
}
console.log(
  `\n${findings.length} sentences are glued together from pieces (${Object.entries(byKind)
    .map(([k, n]) => `${n} ${k}`)
    .join(", ")}). Give each one a message of its own.`,
);
process.exit(CHECK ? 1 : 0);
