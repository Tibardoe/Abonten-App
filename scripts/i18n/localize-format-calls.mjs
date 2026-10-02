#!/usr/bin/env node
// Passes the reader's locale to the @abonten/core formatters.
//
// The core date/time/count helpers take the locale as their last argument
// (packages/core/src/dateFormatter.ts). This rewrites every call in the app
// to pass it, adding `const locale = useLocale()` (client components),
// `const locale = await getLocale()` (async server components) or the
// native `useLocale()` hook to the enclosing component. Calls that are not
// inside a component (server helpers, actions) are listed for a hand edit.
//
//   node scripts/i18n/localize-format-calls.mjs --target web [--apply]
//   node scripts/i18n/localize-format-calls.mjs --target mobile [--apply]

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const args = process.argv.slice(2);
const target = args[args.indexOf("--target") + 1] ?? "web";
const APPLY = args.includes("--apply");

// function name -> index of the locale argument (missing earlier optional
// arguments are filled with `undefined`).
const LOCALE_ARG = {
  getFormattedEventDate: 4,
  getEventCardDateTime: 4,
  formatFullDateTimeRange: 3,
  formatSingleDateTime: 2,
  formatDateWithSuffix: 2,
  getDateParts: 2,
  formatSpecificDateWithTimeRange: 2,
  getRelativeTime: 2,
  formatWeekRange: 1,
  formatDistance: 2,
  clockTime: 1,
  daySeparatorLabel: 1,
  countLabel: 3,
};
const CORE_MODULES =
  /^@abonten\/core\/(dateFormatter|messagingThread|content\/copy|weekly\/week|units\/distance)$/;

const TARGETS = {
  web: {
    roots: ["apps/web/src"],
    exclude: ["/api/", ".test.", "/e2e/"],
    client: {
      line: "const locale = useLocale();",
      name: "useLocale",
      from: "next-intl",
    },
    server: {
      line: "const locale = await getLocale();",
      name: "getLocale",
      from: "next-intl/server",
    },
  },
  mobile: {
    roots: ["apps/mobile/app", "apps/mobile/src", "packages/ui-native/src"],
    exclude: [".test.", "packages/ui-native/src/i18n/"],
    client: {
      line: "const { locale } = useLocale();",
      name: "useLocale",
      from: "@abonten/ui-native/i18n",
    },
    server: null,
  },
};
const cfg = TARGETS[target];

function walk(dir, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") walk(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = cfg.roots
  .flatMap((r) => walk(join(ROOT, r), []))
  .map((f) => relative(ROOT, f).split(sep).join("/"))
  .filter((f) => !cfg.exclude.some((x) => f.includes(x)));

const isFn = (n) =>
  ts.isFunctionDeclaration(n) ||
  ts.isFunctionExpression(n) ||
  ts.isArrowFunction(n) ||
  ts.isMethodDeclaration(n);

function fnName(fn) {
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name)
    return fn.name.text;
  let p = fn.parent;
  while (p && (ts.isCallExpression(p) || ts.isParenthesizedExpression(p)))
    p = p.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name))
    return p.name.text;
  return undefined;
}

function componentOf(node) {
  for (let n = node.parent; n && !ts.isSourceFile(n); n = n.parent) {
    if (isFn(n)) {
      const name = fnName(n);
      const isDefault =
        ts.isFunctionDeclaration(n) &&
        n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      if ((name && /^([A-Z]|use[A-Z])/.test(name)) || isDefault) return n;
    }
  }
  return null;
}

function declaresLocale(fn) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (
      (ts.isVariableDeclaration(n) ||
        ts.isParameter(n) ||
        ts.isBindingElement(n)) &&
      ts.isIdentifier(n.name) &&
      n.name.text === "locale"
    ) {
      found = true;
      return;
    }
    if (isFn(n) && n !== fn) return; // a nested function's own `locale` does not count
    ts.forEachChild(n, visit);
  };
  for (const p of fn.parameters) visit(p);
  if (fn.body) ts.forEachChild(fn.body, visit);
  return found;
}

let rewritten = 0;
const manual = [];

for (const file of files) {
  const abs = join(ROOT, file);
  const src = readFileSync(abs, "utf8");
  if (
    !/@abonten\/core\/(dateFormatter|messagingThread|content\/copy|weekly\/week|units\/distance)/.test(
      src,
    )
  )
    continue;
  const sf = ts.createSourceFile(
    abs,
    src,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const imported = new Map(); // local name -> original
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier))
      continue;
    if (!CORE_MODULES.test(st.moduleSpecifier.text)) continue;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) {
        const original = (el.propertyName ?? el.name).text;
        if (original in LOCALE_ARG) imported.set(el.name.text, original);
      }
    }
  }
  if (imported.size === 0) continue;

  const edits = [];
  const hosts = new Map(); // fn -> needs hook insert
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      imported.has(node.expression.text)
    ) {
      const original = imported.get(node.expression.text);
      const idx = LOCALE_ARG[original];
      const argsN = node.arguments;
      const last = argsN[argsN.length - 1];
      const already =
        argsN.length > idx ||
        (last &&
          ts.isIdentifier(last) &&
          last.text === "locale" &&
          argsN.length === idx + 1);
      if (!already) {
        const host = componentOf(node);
        if (!host) {
          manual.push(
            `${file}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1} ${original}()`,
          );
        } else {
          const fill = [];
          for (let i = argsN.length; i < idx; i++) fill.push("undefined");
          fill.push("locale");
          const insertAt = argsN.length
            ? argsN[argsN.length - 1].end
            : node.arguments.pos;
          edits.push({
            start: insertAt,
            end: insertAt,
            text: `${argsN.length ? ", " : ""}${fill.join(", ")}`,
          });
          if (!declaresLocale(host)) hosts.set(host, true);
          rewritten++;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (edits.length === 0) continue;

  const isClient = /^\s*"use client";/m.test(src);
  const needImport = new Set();
  for (const fn of hosts.keys()) {
    const isAsync = !!fn.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
    );
    const variant = isAsync ? cfg.server : cfg.client;
    if (!variant) {
      manual.push(
        `${file}: async component ${fnName(fn) ?? "?"} (no server hook on ${target})`,
      );
      continue;
    }
    if (!isAsync && !isClient && target === "web") {
      // A sync Server Component: useLocale() from next-intl works in RSC.
    }
    const body = fn.body;
    if (body && ts.isBlock(body)) {
      edits.push({
        start: body.getStart(sf) + 1,
        end: body.getStart(sf) + 1,
        text: `\n  ${variant.line}\n`,
      });
    } else if (body) {
      edits.push({
        start: body.getStart(sf),
        end: body.getStart(sf),
        text: `{ ${variant.line} return `,
      });
      edits.push({ start: body.end, end: body.end, text: "; }" });
    }
    needImport.add(variant);
  }

  let out = src;
  const importEdits = [];
  for (const variant of needImport) {
    const existing = sf.statements.find(
      (s) =>
        ts.isImportDeclaration(s) &&
        ts.isStringLiteral(s.moduleSpecifier) &&
        s.moduleSpecifier.text === variant.from,
    );
    if (existing) {
      const nb = existing.importClause?.namedBindings;
      if (nb && ts.isNamedImports(nb)) {
        if (!nb.elements.some((e) => e.name.text === variant.name)) {
          const lastEl = nb.elements[nb.elements.length - 1];
          importEdits.push({
            start: lastEl.end,
            end: lastEl.end,
            text: `, ${variant.name}`,
          });
        }
        continue;
      }
    }
    const lastImport = [...sf.statements]
      .reverse()
      .find((s) => ts.isImportDeclaration(s));
    const at = lastImport ? lastImport.end : 0;
    importEdits.push({
      start: at,
      end: at,
      text: `\nimport { ${variant.name} } from "${variant.from}";`,
    });
  }
  const all = [...edits, ...importEdits].sort((a, b) => b.start - a.start);
  for (const e of all) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  if (APPLY) writeFileSync(abs, out);
}

console.log(
  `${target}: ${rewritten} calls ${APPLY ? "rewritten" : "would be rewritten"}`,
);
if (manual.length) {
  console.log("Hand edits (not inside a component):");
  for (const m of manual) console.log(`  ${m}`);
}
