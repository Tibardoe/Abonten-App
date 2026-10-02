#!/usr/bin/env node
// One-off codemod, kept so the pattern is documented and repeatable:
//   node scripts/i18n/codemods/bind-request-locale.mjs <repo root>
// 1. Server Actions: `export (default) async function X` →
//    `export (default|const X =) withActionLocale(async function X …)`.
// 2. Mobile API handlers: `bindLocaleFromRequest(req);` as the first statement.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";

const ROOT = process.argv[2];

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function ensureImport(sf, source, edits, name, from) {
  const existing = sf.statements.find(
    (s) =>
      ts.isImportDeclaration(s) &&
      ts.isStringLiteral(s.moduleSpecifier) &&
      s.moduleSpecifier.text === from,
  );
  if (existing) {
    const nb = existing.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) {
      if (nb.elements.some((e) => e.name.text === name)) return;
      const last = nb.elements[nb.elements.length - 1];
      edits.push({ start: last.end, end: last.end, text: `, ${name}` });
      return;
    }
  }
  const lastImport = [...sf.statements]
    .reverse()
    .find((s) => ts.isImportDeclaration(s));
  let at = 0;
  if (lastImport) at = lastImport.end;
  else {
    const first = sf.statements[0];
    if (first && ts.isExpressionStatement(first)) at = first.end;
  }
  edits.push({
    start: at,
    end: at,
    text: `\nimport { ${name} } from "${from}";`,
  });
}

function apply(source, edits) {
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of edits)
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

// ── actions ──────────────────────────────────────────────────────────
let actionFiles = 0;
let actionsWrapped = 0;
for (const abs of walk(join(ROOT, "apps/web/src/actions"), []).filter((f) =>
  f.endsWith(".ts"),
)) {
  const source = readFileSync(abs, "utf8");
  if (!/^"use server";/m.test(source)) continue;
  if (source.includes("withActionLocale(")) continue;
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  let count = 0;
  for (const st of sf.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
    const mods = st.modifiers ?? [];
    const isExport = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isAsync = mods.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    if (!isExport || !isAsync) continue;
    const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    const name = st.name.text;
    // `export default async function name(` → `export default withActionLocale(async function name(`
    // `export async function name(`         → `export const name = withActionLocale(async function name(`
    const asyncMod = mods.find((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
    const headStart = st.getStart(sf);
    const asyncStart = asyncMod.getStart(sf);
    edits.push({
      start: headStart,
      end: asyncStart,
      text: isDefault
        ? "export default withActionLocale("
        : `export const ${name} = withActionLocale(`,
    });
    edits.push({ start: st.end, end: st.end, text: ");" });
    count++;
  }
  if (!count) continue;
  ensureImport(
    sf,
    source,
    edits,
    "withActionLocale",
    "@/i18n/withActionLocale",
  );
  writeFileSync(abs, apply(source, edits));
  actionFiles++;
  actionsWrapped += count;
}
console.log(`actions: ${actionsWrapped} wrapped in ${actionFiles} files`);

// ── mobile route handlers ────────────────────────────────────────────
let routeFiles = 0;
let handlers = 0;
for (const abs of walk(join(ROOT, "apps/web/src/app/api/mobile"), []).filter(
  (f) => f.endsWith("route.ts"),
)) {
  const source = readFileSync(abs, "utf8");
  if (source.includes("bindLocaleFromRequest(")) continue;
  const sf = ts.createSourceFile(abs, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  let count = 0;
  for (const st of sf.statements) {
    if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
    if (!/^(GET|POST|PATCH|PUT|DELETE)$/.test(st.name.text)) continue;
    const mods = st.modifiers ?? [];
    if (!mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const first = st.parameters[0];
    let reqName;
    if (first && ts.isIdentifier(first.name)) {
      reqName = first.name.text;
      if (reqName.startsWith("_")) {
        const bare = reqName.replace(/^_+/, "") || "req";
        edits.push({
          start: first.name.getStart(sf),
          end: first.name.end,
          text: bare,
        });
        reqName = bare;
      }
    } else if (!first) {
      edits.push({
        start: st.parameters.pos,
        end: st.parameters.pos,
        text: "req: Request",
      });
      reqName = "req";
    } else {
      console.log(`  skipped (destructured request): ${relative(ROOT, abs)}`);
      continue;
    }
    const open = st.body.getStart(sf) + 1;
    edits.push({
      start: open,
      end: open,
      text: `\n  bindLocaleFromRequest(${reqName});`,
    });
    count++;
  }
  if (!count) continue;
  ensureImport(
    sf,
    source,
    edits,
    "bindLocaleFromRequest",
    "@abonten/services/i18n/requestLocale",
  );
  writeFileSync(abs, apply(source, edits));
  routeFiles++;
  handlers += count;
}
console.log(`routes: ${handlers} handlers bound in ${routeFiles} files`);
