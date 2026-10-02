#!/usr/bin/env node
// A Server Action answers with an envelope ({ status, message?, data? }) and
// never throws: callers read `status`. The one way a call can still reject
// is in the browser, before the action runs: the connection dropped, or the
// tab is older than the deployment and the server no longer knows the
// action. A handler written as
//
//   setBusy(true);
//   const res = await saveThing(input);
//   setBusy(false);
//
// then leaves the button busy for good, and inside a transition the
// rejection goes to the error boundary and replaces the page, with whatever
// the person had typed.
//
// This check finds every call to a Server Action from browser code that has
// nothing to catch that rejection. A call is safe when it is
//   - guarded: `await saveThing(input).catch(actionUnreachable)`
//     (apps/web/src/utils/actionUnreachable.ts and, for the console,
//     apps/admin/src/lib/actionUnreachable.ts turn the rejection into the
//     envelope the caller already handles);
//   - inside a `try` block, or followed by its own `.catch(...)`;
//   - made by React Query (inside a queryFn / mutationFn, or the page
//     fetcher of a paginated list), which catches it and reports it through
//     the query's or the mutation's error state.
//
// The web app and the admin console are both checked; each has its own
// guard (the console is English only, and words the unknown outcome of a
// staff action differently).
//
//   node scripts/check-action-calls.mjs            report
//   node scripts/check-action-calls.mjs --check    fail when one is unguarded
//   node scripts/check-action-calls.mjs --fix      add the guard

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHECK = process.argv.includes("--check");
const FIX = process.argv.includes("--fix");

const GUARD = "actionUnreachable";

const APPS = [
  {
    name: "web",
    src: join(ROOT, "apps", "web", "src"),
    // Where the Server Actions live, as the app imports them.
    actionImport: "@/actions/",
    // Files that are the server side themselves.
    serverSide: ["actions/", "app/api/"],
    guardModule: "@/utils/actionUnreachable",
  },
  {
    name: "admin",
    src: join(ROOT, "apps", "admin", "src"),
    actionImport: "@/server/actions/",
    serverSide: ["server/", "app/api/"],
    guardModule: "@/lib/actionUnreachable",
  },
];

// React Query runs these and catches what they throw.
const MANAGED_PROPERTIES = new Set(["queryFn", "mutationFn"]);
// The page fetcher handed to a paginated list (InfiniteList and the list
// views built on it) is that list's queryFn.
const PAGE_FETCHER = /^fetch\w*Page$/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

function directives(source) {
  const found = new Set();
  for (const statement of source.statements) {
    if (
      ts.isExpressionStatement(statement) &&
      ts.isStringLiteral(statement.expression)
    ) {
      found.add(statement.expression.text);
    } else break;
  }
  return found;
}

/** Names this file imports from the Server Actions folder. */
function actionImports(source, actionImport) {
  const names = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = statement.moduleSpecifier.text;
    if (!from.startsWith(actionImport)) continue;
    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!element.isTypeOnly) names.add(element.name.text);
      }
    }
  }
  return names;
}

// Hooks and event handlers only exist in the browser. A file with neither a
// "use client" line nor a hook is a Server Component or a server helper,
// where an action is an ordinary function call.
function isBrowserCode(source, text) {
  const d = directives(source);
  if (d.has("use server")) return false;
  if (d.has("use client")) return true;
  return /\buse(State|Effect|Callback|Memo|Ref|Transition|Query|Mutation|InfiniteQuery|QueryClient)\b/.test(
    text,
  );
}

function isCatchCall(node) {
  // <call>.catch(...)   or   <call>.then(onOk, onError)
  const access = node.parent;
  if (!access || !ts.isPropertyAccessExpression(access)) return false;
  if (access.expression !== node) return false;
  const call = access.parent;
  if (!call || !ts.isCallExpression(call) || call.expression !== access) {
    return false;
  }
  if (access.name.text === "catch") return true;
  return access.name.text === "then" && call.arguments.length >= 2;
}

function safety(node) {
  if (isCatchCall(node)) return "caught";
  let child = node;
  let current = node.parent;
  while (current) {
    if (ts.isTryStatement(current) && current.tryBlock === child) return "try";
    if (
      ts.isPropertyAssignment(current) &&
      ts.isIdentifier(current.name) &&
      MANAGED_PROPERTIES.has(current.name.text)
    ) {
      return "query";
    }
    if (
      ts.isMethodDeclaration(current) &&
      ts.isIdentifier(current.name) &&
      MANAGED_PROPERTIES.has(current.name.text)
    ) {
      return "query";
    }
    if (
      ts.isJsxAttribute(current) &&
      PAGE_FETCHER.test(current.name.getText())
    ) {
      return "query";
    }
    if (
      (ts.isFunctionDeclaration(current) ||
        ts.isVariableDeclaration(current)) &&
      current.name &&
      ts.isIdentifier(current.name) &&
      PAGE_FETCHER.test(current.name.text)
    ) {
      return "query";
    }
    // Promise.allSettled([...]) never rejects.
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "allSettled"
    ) {
      return "settled";
    }
    // Promise.all([...]).catch(...) / inside a call that is itself caught.
    if (ts.isCallExpression(current) && isCatchCall(current)) return "caught";
    child = current;
    current = current.parent;
  }
  return null;
}

const findings = [];
let filesFixed = 0;
let callsFixed = 0;
let safeCalls = 0;

const files = APPS.flatMap((app) =>
  walk(app.src).map((file) => ({ app, file })),
);

for (const { app, file } of files) {
  const rel = relative(app.src, file).split(sep).join("/");
  if (app.serverSide.some((prefix) => rel.startsWith(prefix))) continue;
  const text = readFileSync(file, "utf8");
  if (!text.includes(app.actionImport)) continue;
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  if (!isBrowserCode(source, text)) continue;
  const actions = actionImports(source, app.actionImport);
  if (actions.size === 0) continue;

  const unguarded = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      actions.has(node.expression.text)
    ) {
      if (safety(node)) safeCalls += 1;
      else unguarded.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (unguarded.length === 0) continue;

  if (!FIX) {
    for (const node of unguarded) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart());
      findings.push(
        `apps/${app.name}/src/${rel}:${line + 1}  ${node.expression.text}(…)`,
      );
    }
    continue;
  }

  // Add `.catch(actionUnreachable)` after each call, last first so the
  // earlier positions stay true.
  let next = text;
  for (const node of [...unguarded].sort((a, b) => b.end - a.end)) {
    next = `${next.slice(0, node.end)}.catch(${GUARD})${next.slice(node.end)}`;
  }
  if (!next.includes(`from "${app.guardModule}"`)) {
    const lastImport = [...source.statements]
      .filter(ts.isImportDeclaration)
      .pop();
    const at = lastImport ? lastImport.end : 0;
    next = `${next.slice(0, at)}\nimport { ${GUARD} } from "${app.guardModule}";${next.slice(at)}`;
  }
  writeFileSync(file, next);
  filesFixed += 1;
  callsFixed += unguarded.length;
}

if (FIX) {
  console.log(
    `action calls: guarded ${callsFixed} calls in ${filesFixed} files (run Biome on them to sort the imports).`,
  );
  process.exit(0);
}

if (findings.length === 0) {
  console.log(
    `action calls: every Server Action called from the browser is guarded (${safeCalls} calls).`,
  );
  process.exit(0);
}

console.log(
  `action calls: ${findings.length} calls from the browser have nothing to catch a dropped connection (${safeCalls} are guarded):`,
);
for (const finding of findings) console.log(`  ${finding}`);
console.log(
  `\nAdd .catch(${GUARD}) (from ${APPS.map((app) => app.guardModule).join(" / ")}), or run: node scripts/check-action-calls.mjs --fix`,
);
process.exit(CHECK ? 1 : 0);
