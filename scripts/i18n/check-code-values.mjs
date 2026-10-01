#!/usr/bin/env node
// A code is not a word. `t("noBookings", { status: filter })` with
// `filter: "pending" | "accepted"` prints "No pending bookings" in English
// and "Aucune réservation pending" in French: the catalog can translate the
// sentence but not the value dropped into it. A value like that must be
// chosen by the message itself — `{status, select, pending {…} other {…}}`
// — or be translated before it is passed.
//
// This uses the type checker to find them: every translator call whose
// values object passes something typed as a set of string literals (or as a
// literal) into a message that prints it as plain text.
//
//   node scripts/i18n/check-code-values.mjs            # report
//   node scripts/i18n/check-code-values.mjs --check    # exit 1 on a finding
//
// It type-checks each app, so it takes a minute or two; it is not part of
// the pre-push hook.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MESSAGES = join(ROOT, "packages/i18n/messages/en");
const CHECK = process.argv.includes("--check");
const PROJECTS = [
  "apps/web/tsconfig.json",
  "apps/mobile/tsconfig.json",
  "packages/services/tsconfig.json",
  "packages/core/tsconfig.json",
];

// every message of every namespace, by key path
const messages = {};
for (const file of readdirSync(MESSAGES)) {
  if (!file.endsWith(".json")) continue;
  const out = {};
  const walk = (value, prefix) => {
    for (const [k, v] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") walk(v, path);
      else out[path] = String(v);
    }
  };
  walk(JSON.parse(readFileSync(join(MESSAGES, file), "utf8")), "");
  messages[file.replace(/\.json$/, "")] = out;
}

/** Whether `message` prints `{name}` as plain text (not select/plural). */
function printsPlainly(message, name) {
  return new RegExp(`\\{\\s*${name}\\s*\\}`).test(message);
}

/** Every message with this key, in any namespace (the call's own is unknown). */
function candidates(key) {
  const found = [];
  for (const [ns, table] of Object.entries(messages)) {
    for (const [path, text] of Object.entries(table)) {
      if (path === key || path.endsWith(`.${key}`)) found.push({ ns, text });
    }
  }
  return found;
}

const METHODS = new Set(["rich", "markup"]);
const TRANSLATOR = /^(t[A-Z]?\w*|tr|core|words\.(t|core))$/;

function isCode(type, checker) {
  if (type.isUnion()) {
    const parts = type.types.filter(
      (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    );
    return (
      parts.length > 0 &&
      parts.every((t) => t.isStringLiteral()) &&
      // a union of translated words would be `string`; literals are codes
      parts.some((t) => /^[a-z][a-z0-9_-]*$/.test(t.value))
    );
  }
  return type.isStringLiteral() && /^[a-z][a-z0-9_-]*$/.test(type.value);
}

/**
 * English put together in code: `in ${city}`, `${filter} ` — a template
 * with words of its own, or one that prints a code. Returns what was found.
 */
function composedIn(node, checker) {
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return composedIn(node.expression, checker);
  }
  if (ts.isConditionalExpression(node)) {
    return (
      composedIn(node.whenTrue, checker) ?? composedIn(node.whenFalse, checker)
    );
  }
  if (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
      ts.SyntaxKind.PlusToken,
    ].includes(node.operatorToken.kind)
  ) {
    return composedIn(node.left, checker) ?? composedIn(node.right, checker);
  }
  if (ts.isTemplateExpression(node)) {
    const words = [
      node.head.text,
      ...node.templateSpans.map((s) => s.literal.text),
    ]
      .join(" ")
      .trim();
    // a unit symbol beside a number (`${n} km`) is not a word
    if (
      /\p{L}{2,}/u.test(words) &&
      !/^(km|mi|m|kg|g|ms|s|h|min|%)$/.test(words)
    ) {
      return `words in code: \`${node.getText()}\``;
    }
    for (const span of node.templateSpans) {
      const type = checker.getTypeAtLocation(span.expression);
      const members = type.isUnion() ? type.types : [type];
      // "km" | "mi": unit symbols, the same in every language
      if (
        members.every(
          (m) => m.isStringLiteral() && /^(km|mi|m|kg|g)$/.test(m.value),
        )
      ) {
        continue;
      }
      if (isCode(type, checker)) {
        return `a code in a template: \`${node.getText()}\``;
      }
    }
  }
  return null;
}

const findings = [];

for (const project of PROJECTS) {
  const configPath = join(ROOT, project);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
  );
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: true,
  });
  const checker = program.getTypeChecker();

  for (const sf of program.getSourceFiles()) {
    const file = relative(ROOT, sf.fileName).split(sep).join("/");
    if (
      file.includes("node_modules") ||
      file.startsWith("..") ||
      file.includes(".test.") ||
      sf.isDeclarationFile
    ) {
      continue;
    }
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        let callee = node.expression;
        if (
          ts.isPropertyAccessExpression(callee) &&
          METHODS.has(callee.name.text)
        ) {
          callee = callee.expression;
        }
        const name = callee.getText(sf);
        const [keyArg, valuesArg] = node.arguments;
        if (
          TRANSLATOR.test(name) &&
          keyArg &&
          ts.isStringLiteralLike(keyArg) &&
          valuesArg &&
          ts.isObjectLiteralExpression(valuesArg)
        ) {
          const texts = candidates(keyArg.text);
          for (const prop of valuesArg.properties) {
            if (
              !ts.isPropertyAssignment(prop) &&
              !ts.isShorthandPropertyAssignment(prop)
            ) {
              continue;
            }
            const propName = prop.name.getText(sf);
            const valueNode = ts.isPropertyAssignment(prop)
              ? prop.initializer
              : prop.name;
            // a literal written in place ("yes") is the writer's own choice
            if (ts.isStringLiteralLike(valueNode)) continue;
            const type = checker.getTypeAtLocation(valueNode);
            const composed = composedIn(valueNode, checker);
            if (!isCode(type, checker) && !composed) continue;
            const plain = texts.filter((m) => printsPlainly(m.text, propName));
            if (texts.length > 0 && plain.length === 0) continue;
            const { line } = sf.getLineAndCharacterOfPosition(
              node.getStart(sf),
            );
            findings.push({
              file,
              line: line + 1,
              key: keyArg.text,
              param: propName,
              type: composed ?? checker.typeToString(type),
              message: plain[0]?.text ?? "(message not found)",
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
}

const seen = new Set();
const unique = findings.filter((f) => {
  const id = `${f.file}:${f.line}:${f.key}:${f.param}`;
  if (seen.has(id)) return false;
  seen.add(id);
  return true;
});

if (unique.length === 0) {
  console.log("code values: no message prints a code as a word.");
  process.exit(0);
}
for (const f of unique) {
  console.log(
    `${f.file}:${f.line}  ${f.key}  {${f.param}} is ${f.type}\n    ${f.message}`,
  );
}
console.log(
  `\n${unique.length} value${unique.length === 1 ? "" : "s"} printed as words are codes. Let the message choose the word (select), or translate the value first.`,
);
process.exit(CHECK ? 1 : 0);
