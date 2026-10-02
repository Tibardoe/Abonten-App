#!/usr/bin/env node
// A translated label is for reading, never for deciding.
//
// When the app's English was moved into the catalogs, code that used an
// English label as a VALUE was swept along with it:
//
//   ticket === t("singleTicketType")          the mode kept in state
//   handleTicket(t("free"))                   …and sent to the server, which
//                                             asks `freeEvents === "Free"`
//   tt[0].type === t("singleTicket")          a database code
//
// In English these happen to work. In French the organiser's free event was
// posted as "Gratuit", the server did not recognise it, and the event could
// not be created. This check fails when a translator's result is used where
// a code belongs:
//
//   - compared (===, !==, ==, !=, switch/case, includes/indexOf/startsWith);
//   - handed to a setter or handler that is not about words to show
//     (setTicket(t(…)) — but setError(t(…)) is fine);
//   - the `value`, `defaultValue`, `id`, `name` or `key` of an element, or
//     a `value` / `id` / `key` / `type` / `kind` / `code` property;
//   - an index (`MAP[t(…)]`) or the first state of a non-display useState;
//   - listed, and then used as a key by whatever walks the list:
//     `[t("today"), t("yesterday")].filter((k) => buckets[k].length)`. The
//     buckets were filled under English names, so the notifications screen
//     crashed in every other language.
//
//   node scripts/i18n/check-label-logic.mjs            # report
//   node scripts/i18n/check-label-logic.mjs --check    # CI
//
// Keep a code in state and word it where it is shown. A place that really
// is display despite its name goes in ALLOWED below with the reason.

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
  "packages/core/src",
  "packages/services/src",
];
const EXCLUDE = [".test.", ".d.ts", "__integration__", "/e2e/", "/i18n/"];

// file::text of the call → why it is display after all.
const ALLOWED = new Map([]);

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(join(ROOT, r), []))
  .map((f) => relative(ROOT, f).split(sep).join("/"))
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .filter((f) => !EXCLUDE.some((x) => f.includes(x)))
  .sort();

// What makes a translator: the hooks and factories that return one.
const TRANSLATOR_SOURCES =
  /^(useTranslations|getTranslations|translatorFor|coreTranslator|serverTranslator|coreT|coreTFor|trFor|emailT|useValidationText)$/;
// …and the functions that ARE one.
const TRANSLATOR_CALLS = /^(tr|coreString)$/;

// A setter / handler / prop whose job is to show words.
const DISPLAY_NAME =
  /(Error|Errors|Message|Messages|Msg|Label|Title|Subtitle|Text|Hint|Notice|Description|Toast|Feedback|Placeholder|Heading|Caption|Reason|Warning|Info|Note|Status(Text|Message|Label)?|Summary|Body|Copy|Prompt|Announce|Announcement|Alert|Problem|Tooltip|Name|Success|Done|Invalid\w*|Failure|Failed)$/i;
const DISPLAY_CALL =
  /^(toast\.\w+|Alert\.alert|alert|confirm|announce\w*|AccessibilityInfo\.\w+|console\.\w+|logger\.\w+|share\w*|Share\.share|showToast|notify\w*|fail\w*|setError|setFieldError|form\.setError|setFormError|encodeURIComponent|String|escapeHtml|richEmailText|React\.createElement|createElement|cn|clsx)$/;

const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);
const LOGIC_ATTRS = new Set(["value", "defaultValue", "id", "name", "key"]);
const LOGIC_KEYS = new Set(["value", "id", "key", "type", "kind", "code"]);
const LOOKUP_METHODS =
  /\.(includes|indexOf|lastIndexOf|startsWith|endsWith|has|get|localeCompare)$/;

const findings = [];

for (const file of files) {
  const abs = join(ROOT, file);
  const source = readFileSync(abs, "utf8");
  if (!/\bt[A-Za-z]*\(|coreString\(|\btr\(/.test(source)) continue;
  const sf = ts.createSourceFile(
    abs,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // The names that hold a translator in this file.
  const translators = new Set();
  const collect = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      let init = node.initializer;
      if (ts.isAwaitExpression(init)) init = init.expression;
      if (
        ts.isCallExpression(init) &&
        TRANSLATOR_SOURCES.test(init.expression.getText(sf))
      ) {
        translators.add(node.name.text);
      }
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type) {
      if (/Translator|Translate\b/.test(node.type.getText(sf)))
        translators.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const isTranslation = (node) => {
    if (!ts.isCallExpression(node)) return false;
    const callee = node.expression;
    if (ts.isIdentifier(callee)) {
      return translators.has(callee.text) || TRANSLATOR_CALLS.test(callee.text);
    }
    // translatorFor("ns")("key"): a translator made and called in one go
    if (
      ts.isCallExpression(callee) &&
      TRANSLATOR_SOURCES.test(callee.expression.getText(sf))
    ) {
      return true;
    }
    // words.t("…"), i18n.t("…")
    return (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "t" &&
      /^(words|i18n)$/.test(callee.expression.getText(sf))
    );
  };

  const report = (node, why) => {
    const text = node.getText(sf).replace(/\s+/g, " ");
    if (ALLOWED.has(`${file}::${text}`)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    findings.push({ file, line, text, why });
  };

  // A list of translated labels, walked by a callback that uses each one
  // as a key: [t("a"), t("b")].filter((k) => MAP[k]).
  const WALKS =
    /^(filter|map|forEach|find|findIndex|some|every|flatMap|reduce)$/;
  const walkedLists = new Set();
  const keyUseIn = (callback) => {
    if (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) {
      return null;
    }
    const first = callback.parameters[0];
    if (!first || !ts.isIdentifier(first.name)) return null;
    const name = first.name.text;
    let found = null;
    const look = (n) => {
      if (found) return;
      if (
        ts.isElementAccessExpression(n) &&
        ts.isIdentifier(n.argumentExpression) &&
        n.argumentExpression.text === name
      ) {
        found = n;
        return;
      }
      if (
        ts.isBinaryExpression(n) &&
        COMPARISONS.has(n.operatorToken.kind) &&
        [n.left, n.right].some(
          (side) => ts.isIdentifier(side) && side.text === name,
        )
      ) {
        found = n;
        return;
      }
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        /^(has|get|includes|indexOf)$/.test(n.expression.name.text) &&
        n.arguments.some((arg) => ts.isIdentifier(arg) && arg.text === name)
      ) {
        found = n;
        return;
      }
      ts.forEachChild(n, look);
    };
    look(callback.body);
    return found;
  };
  const checkWalk = (list, receiver) => {
    // receiver.method(callback)
    const access = receiver.parent;
    if (
      !access ||
      !ts.isPropertyAccessExpression(access) ||
      access.expression !== receiver ||
      !WALKS.test(access.name.text)
    ) {
      return;
    }
    const call = access.parent;
    if (!call || !ts.isCallExpression(call) || call.expression !== access)
      return;
    const use = call.arguments[0] ? keyUseIn(call.arguments[0]) : null;
    if (use && !walkedLists.has(list.pos)) {
      walkedLists.add(list.pos);
      report(use, "a list of translated labels used as keys");
    }
  };
  const checkList = (list) => {
    let value = list;
    while (
      value.parent &&
      (ts.isParenthesizedExpression(value.parent) ||
        ts.isAsExpression(value.parent) ||
        ts.isSatisfiesExpression(value.parent))
    ) {
      value = value.parent;
    }
    checkWalk(list, value);
    // const labels = [t(…), …]; labels.filter((k) => MAP[k])
    const declaration = value.parent;
    if (
      declaration &&
      ts.isVariableDeclaration(declaration) &&
      ts.isIdentifier(declaration.name)
    ) {
      const name = declaration.name.text;
      const find = (n) => {
        if (ts.isIdentifier(n) && n.text === name && n !== declaration.name) {
          checkWalk(list, n);
        }
        ts.forEachChild(n, find);
      };
      find(sf);
    }
  };

  const visit = (node) => {
    if (
      ts.isArrayLiteralExpression(node) &&
      node.elements.some((element) => isTranslation(element))
    ) {
      checkList(node);
    }
    if (isTranslation(node)) {
      // climb through wrappers that keep it the same value
      let cur = node;
      let p = cur.parent;
      while (
        p &&
        (ts.isParenthesizedExpression(p) ||
          ts.isAsExpression(p) ||
          ts.isNonNullExpression(p) ||
          (ts.isConditionalExpression(p) && p.condition !== cur) ||
          (ts.isBinaryExpression(p) &&
            [
              ts.SyntaxKind.QuestionQuestionToken,
              ts.SyntaxKind.BarBarToken,
            ].includes(p.operatorToken.kind)))
      ) {
        cur = p;
        p = cur.parent;
      }

      if (
        p &&
        ts.isBinaryExpression(p) &&
        COMPARISONS.has(p.operatorToken.kind)
      ) {
        report(p, "compared with a translated label");
      } else if (p && ts.isCaseClause(p)) {
        report(p.expression, "a switch case on a translated label");
      } else if (
        p &&
        ts.isElementAccessExpression(p) &&
        p.argumentExpression === cur
      ) {
        report(p, "indexed by a translated label");
      } else if (p && ts.isCallExpression(p) && p.arguments.includes(cur)) {
        const callee = p.expression.getText(sf).replace(/\s+/g, "");
        const name = callee.split(".").pop() ?? callee;
        if (LOOKUP_METHODS.test(callee)) {
          report(p, "looked up by a translated label");
        } else if (
          /^(set[A-Z]|handle[A-Z]|on[A-Z]|select[A-Z]|choose[A-Z]|update[A-Z])/.test(
            name,
          ) &&
          !DISPLAY_NAME.test(name) &&
          !DISPLAY_CALL.test(callee)
        ) {
          report(p, "a translated label kept as a value");
        } else if (name === "useState") {
          const decl = p.parent;
          const first =
            decl &&
            ts.isVariableDeclaration(decl) &&
            ts.isArrayBindingPattern(decl.name) &&
            decl.name.elements[0] &&
            ts.isBindingElement(decl.name.elements[0])
              ? decl.name.elements[0].name.getText(sf)
              : "";
          if (first && !DISPLAY_NAME.test(first)) {
            report(p, "a translated label as the first state of a value");
          }
        }
      } else if (p && ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent)) {
        const attr = p.parent.name.getText(sf);
        // Only on elements that hold a choice: <Row value={…}> and
        // <StatTile value={…}> show their value, <option value={…}> is one.
        const tag = p.parent.parent.parent.tagName?.getText(sf) ?? "";
        const holdsAChoice =
          /^(input|option|select|textarea|button|TextInput|Picker|Select\w*|Option|Radio\w*|Tabs\w*|ToggleGroup\w*|Segmented\w*|Checkbox|Switch)$/.test(
            tag,
          );
        if (LOGIC_ATTRS.has(attr) && holdsAChoice) {
          report(p.parent, `a translated label as the ${attr} of <${tag}>`);
        }
      } else if (
        p &&
        ts.isPropertyAssignment(p) &&
        p.initializer === cur &&
        LOGIC_KEYS.has(p.name.getText(sf).replace(/["']/g, ""))
      ) {
        // t("x", { value: t("y") }) passes words into words: display.
        const object = p.parent;
        const call = object?.parent;
        const isMessageValues =
          call && ts.isCallExpression(call) && isTranslation(call);
        if (!isMessageValues) {
          report(p, `a translated label as a ${p.name.getText(sf)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (findings.length === 0) {
  console.log("label logic: no translated label is used as a value.");
  process.exit(0);
}
const byFile = new Map();
for (const f of findings) {
  const list = byFile.get(f.file) ?? [];
  list.push(f);
  byFile.set(f.file, list);
}
for (const [file, list] of byFile) {
  console.log(file);
  for (const f of list)
    console.log(`  ${f.line}: ${f.why}: ${f.text.slice(0, 140)}`);
}
console.log(
  `\n${findings.length} place${findings.length === 1 ? "" : "s"} in ${byFile.size} file${byFile.size === 1 ? "" : "s"} use a translated label as a value.`,
);
if (CHECK) {
  console.error(
    "Keep a code in state and word it where it is shown (see the header of scripts/i18n/check-label-logic.mjs).",
  );
  process.exit(1);
}
