#!/usr/bin/env node
// Numbers, dates and amounts on screen follow the language chosen in the
// app — not the phone's, not the browser's, not the server's.
//
// `n.toLocaleString()` formats in the DEVICE's language: someone reading
// Abonten in French on an English phone saw "1,234 billets", and a page
// rendered on the server (en-US) disagreed with the browser that hydrated
// it. `formatMoney(currency, amount)` without a language wrote every price
// the British way, and "GH₵1,500" reads as one and a half cedis to a French
// or German reader. This check fails when screen code:
//
//   - calls toLocaleString / toLocaleDateString / toLocaleTimeString with
//     no language (or `undefined`, or a hard-coded "en…");
//   - calls formatMoney / formatMajor / formatCredit / formatCreditDelta /
//     formatMinor / formatCount / formatDate / formatDateTime from
//     @abonten/core without handing over the app's language.
//
// Use @abonten/core/i18n/format (formatCount, formatDate, formatDateTime)
// and pass `locale` (web `useLocale()` / `await getLocale()`, native
// `useLocale().locale`, or `getCurrentLocale()` outside a component).
//
//   node scripts/i18n/check-formats.mjs            # report
//   node scripts/i18n/check-formats.mjs --check    # CI

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
const EXCLUDE = [
  ".test.",
  ".d.ts",
  "/e2e/",
  // Server code words money for a recipient through the services' own
  // helpers; emails and API routes are checked there.
  "apps/web/src/actions/",
  "apps/web/src/app/api/",
  "apps/web/src/i18n/",
  "apps/web/src/components/ui/",
  "apps/web/src/lib/",
  "packages/ui-native/src/i18n/",
];

// formatter → index of the argument that carries the language, and whether
// it sits in an options object.
const FORMATTERS = {
  formatMoney: { at: 2, inOptions: true },
  formatMajor: { at: 2, inOptions: true },
  formatCredit: { at: 2 },
  formatCreditDelta: { at: 2 },
  formatMinor: { at: 2 },
  formatCount: { at: 1 },
  formatDate: { at: 1 },
  formatDateTime: { at: 1 },
};

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

const findings = [];

for (const file of files) {
  const abs = join(ROOT, file);
  const source = readFileSync(abs, "utf8");
  if (!/toLocale(Date|Time)?String\(|\bformat[A-Z]\w*\(/.test(source)) continue;
  const sf = ts.createSourceFile(
    abs,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  // Only the shared formatters count; a local helper of the same name is
  // somebody else's function. The minor-unit formatter takes (money,
  // options), so its language sits one argument earlier.
  const imported = new Map();
  for (const st of sf.statements) {
    if (
      ts.isImportDeclaration(st) &&
      /^@abonten\/core\//.test(st.moduleSpecifier.text) &&
      st.importClause?.namedBindings &&
      ts.isNamedImports(st.importClause.namedBindings)
    ) {
      for (const el of st.importClause.namedBindings.elements) {
        const name = (el.propertyName ?? el.name).text;
        const spec = FORMATTERS[name];
        if (!spec) continue;
        const minorUnit =
          name === "formatMoney" &&
          st.moduleSpecifier.text === "@abonten/core/money/formatMoney";
        imported.set(el.name.text, minorUnit ? { at: 1, inOptions: true } : spec);
      }
    }
  }

  const report = (node, why) => {
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    findings.push({
      file,
      line,
      why,
      text: node.getText(sf).replace(/\s+/g, " ").slice(0, 120),
    });
  };

  // `key={i.toLocaleString()}` is a React key, not text on screen.
  const isReactKey = (node) => {
    for (let cur = node.parent; cur; cur = cur.parent) {
      if (ts.isJsxAttribute(cur)) return cur.name.getText(sf) === "key";
      if (ts.isPropertyAssignment(cur)) return cur.name.getText(sf) === "key";
      if (ts.isJsxElement(cur) || ts.isBlock(cur)) return false;
    }
    return false;
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        ts.isPropertyAccessExpression(callee) &&
        /^toLocale(Date|Time)?String$/.test(callee.name.text) &&
        !isReactKey(node)
      ) {
        const first = node.arguments[0];
        const text = first?.getText(sf);
        if (!first || text === "undefined" || /^["']en\b/.test(text)) {
          report(node, "formats in the device's language");
        }
      }
      if (ts.isIdentifier(callee) && imported.has(callee.text)) {
        const spec = imported.get(callee.text);
        const arg = node.arguments[spec.at];
        let given = false;
        if (arg) {
          if (!spec.inOptions) given = true;
          else if (ts.isObjectLiteralExpression(arg)) {
            given = arg.properties.some(
              (p) =>
                ts.isSpreadAssignment(p) ||
                (p.name && p.name.getText(sf) === "locale"),
            );
          } else given = true; // options built elsewhere: trusted
        }
        if (!given) report(node, "is not given the app's language");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (findings.length === 0) {
  console.log(
    "formats: every number, date and amount on screen follows the app's language.",
  );
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
  for (const f of list) console.log(`  ${f.line}: ${f.why}: ${f.text}`);
}
console.log(
  `\n${findings.length} place${findings.length === 1 ? "" : "s"} in ${byFile.size} file${byFile.size === 1 ? "" : "s"} format outside the app's language.`,
);
if (CHECK) {
  console.error(
    "Pass `locale` (see the header of scripts/i18n/check-formats.mjs).",
  );
  process.exit(1);
}
