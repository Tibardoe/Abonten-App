#!/usr/bin/env node
// Which translated messages the BROWSER needs on each part of the web app.
//
// The web app used to hand every catalog to the browser on every page:
// about 380 KB of JSON inside each page's HTML (115 KB compressed), nearly
// all of it for screens the visitor was not on. A page only needs the
// messages its client components read; everything a Server Component says
// is translated on the server and arrives as text.
//
// This script follows the imports of every route file under
// apps/web/src/app/[locale], notes where the "use client" boundary is
// crossed, and records the keys read on the client side of it:
//
//   const t = useTranslations("events")   t("title")            one key
//                                         t(`status.${code}`)   the group
//                                         t(key)                the namespace
//   helper(t, …) / <Row t={t} />          the keys that module reads from
//                                         a translator it is given
//   translatorFor("common")("copied")     call-time translators
//   useValidationText()                   the validation namespace
//
// When it cannot tell which keys a translator will be asked for (it is
// stored, returned, or handed to something it cannot follow) the whole
// namespace is sent: the answer is always a superset, never a guess.
//
// It writes apps/web/src/i18n/routeMessages.generated.json:
//
//   root              the document shell and the site chrome, on every page
//   segments[name]    what the pages under one top-level directory add
//   lazy[name]        the namespaces a lazyWithMessages() boundary loads
//                     when it first opens (i18n/lazyWithMessages.tsx)
//
// AppShell gives `root` to the provider; each segment's layout wraps its
// pages in <SegmentMessages segment="…">. If the analysis ever misses a
// key, the page still works: the provider fetches the namespace on the
// spot (i18n/MessageLoader.tsx) and says so in the console.
//
//   node scripts/i18n/gen-route-messages.mjs             # write
//   node scripts/i18n/gen-route-messages.mjs --check     # CI: current, and
//                                                        # every segment wired
//   node scripts/i18n/gen-route-messages.mjs --report    # sizes per segment
//   node scripts/i18n/gen-route-messages.mjs --why core [--segment events]
//                                                        # what brings it in

import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createKeyResolver, unwrap } from "./lib/key-strings.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB = join(ROOT, "apps/web");
const SRC = join(WEB, "src");
const APP = join(SRC, "app");
const LOCALE_DIR = join(APP, "[locale]");
const PAGES_DIR = join(LOCALE_DIR, "(pages)");
const OUT = join(SRC, "i18n/routeMessages.generated.json");
const OUT_LAZY = join(SRC, "i18n/lazyNamespaces.generated.json");
const MESSAGES = join(ROOT, "packages/i18n/messages");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : null;
};
const CHECK = flag("--check");
const REPORT = flag("--report");
const WHY = option("--why");
const WHY_SEGMENT = option("--segment");

const ROUTE_FILES = new Set([
  "page.tsx",
  "layout.tsx",
  "loading.tsx",
  "error.tsx",
  "not-found.tsx",
  "template.tsx",
  "default.tsx",
]);

const rel = (abs) => relative(ROOT, abs).split(sep).join("/");

// ── resolving imports ────────────────────────────────────────────────

// The workspace packages browser code may take a translator into.
const PACKAGES = {};
for (const name of ["core", "i18n", "validation"]) {
  const dir = join(ROOT, "packages", name);
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) continue;
  PACKAGES[`@abonten/${name}`] = {
    dir,
    exports: JSON.parse(readFileSync(manifest, "utf8")).exports ?? {},
  };
}

function firstFile(base) {
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function resolveImport(from, spec) {
  if (spec.startsWith("@/")) return firstFile(join(SRC, spec.slice(2)));
  if (spec.startsWith(".")) return firstFile(resolve(dirname(from), spec));
  const scope = spec.split("/").slice(0, 2).join("/");
  const pkg = PACKAGES[scope];
  if (!pkg) return null; // someone else's package: no translator of ours
  const sub = `.${spec.slice(scope.length)}`;
  const exact = pkg.exports[sub];
  if (typeof exact === "string") return firstFile(join(pkg.dir, exact));
  for (const [pattern, target] of Object.entries(pkg.exports)) {
    if (typeof target !== "string" || !pattern.endsWith("/*")) continue;
    const prefix = pattern.slice(0, -1);
    if (!sub.startsWith(prefix)) continue;
    const rest = sub.slice(prefix.length);
    if (rest.endsWith(".json")) return null;
    return firstFile(join(pkg.dir, target.replace("*", rest)));
  }
  return null;
}

// ── reading one module ───────────────────────────────────────────────

const FACTORIES = new Set(["useTranslations", "translatorFor"]);
const METHODS = new Set(["rich", "markup", "raw", "has"]);
const WHOLE = "*";

/** `t`, `tc`, `tCommon`, `translate`: a name a translator is given. */
const looksLikeTranslator = (name) =>
  /^(t|tc|tv|tr|tt|translate|translator)$/.test(name) || /^t[A-Z]/.test(name);

/** `useTranslations("ns.group")` → { ns, group }; anything else → null. */
function factoryOf(node) {
  const call = unwrap(node);
  if (!call || !ts.isCallExpression(call)) return null;
  if (!ts.isIdentifier(call.expression)) return null;
  if (!FACTORIES.has(call.expression.text)) return null;
  const first = call.arguments[0];
  if (!first || !ts.isStringLiteralLike(first)) return { ns: null, group: "" };
  const [ns, ...group] = first.text.split(".");
  return { ns, group: group.join(".") };
}

/** The declaration of `name` visible from `node`, innermost scope first. */
function findBinding(name, node) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    const statements =
      ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)
        ? scope.statements
        : ts.isCaseClause(scope) || ts.isDefaultClause(scope)
          ? scope.statements
          : null;
    if (statements) {
      for (const st of statements) {
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === name) return d;
            if (
              (ts.isObjectBindingPattern(d.name) ||
                ts.isArrayBindingPattern(d.name)) &&
              d.name.elements.some(
                (el) =>
                  ts.isBindingElement(el) &&
                  ts.isIdentifier(el.name) &&
                  el.name.text === name,
              )
            ) {
              return d;
            }
          }
        }
        if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st;
      }
    }
    if (ts.isFunctionLike(scope)) {
      for (const p of scope.parameters) {
        if (ts.isIdentifier(p.name) && p.name.text === name) return p;
        if (
          ts.isObjectBindingPattern(p.name) &&
          p.name.elements.some(
            (el) => ts.isIdentifier(el.name) && el.name.text === name,
          )
        ) {
          return p;
        }
      }
    }
  }
  return null;
}

// ── which keys an argument can be ────────────────────────────────────
//
// t("title") is one key. t(cond ? "a" : "b"), t(STATUS_LABEL[status]) and
// t(tab.label) are a few known keys too, and the type checker and the
// declarations say which. Only when neither can tell is the answer "any
// key of the namespace".

const tsconfig = ts.getParsedCommandLineOfConfigFile(
  join(WEB, "tsconfig.json"),
  {},
  { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} },
);
const program = ts.createProgram({
  rootNames: tsconfig.fileNames,
  options: { ...tsconfig.options, noEmit: true },
});
const checker = program.getTypeChecker();

function sourceFileOf(abs) {
  const known = program.getSourceFile(abs.split(sep).join("/"));
  if (known) return known;
  return ts.createSourceFile(
    abs,
    readFileSync(abs, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

const { strings } = createKeyResolver(checker);

/** The entries a key argument asks for: keys, groups, prefixes or WHOLE. */
function entriesOf(arg, group) {
  const all = group || WHOLE;
  const found = arg ? strings(arg) : null;
  if (!found) return [all];
  const out = new Set();
  for (const { text, open } of found) {
    const full = group ? (text ? `${group}.${text}` : group) : text;
    if (!open) {
      if (text) out.add(full); // "" marks "no label" in a table: never asked
    } else if (!text) return [all];
    else out.add(full.endsWith(".") ? full.slice(0, -1) : `${full}*`);
  }
  return [...out];
}

const moduleCache = new Map();

function readModule(abs) {
  const cached = moduleCache.get(abs);
  if (cached) return cached;
  const sf = sourceFileOf(abs);
  const directive = sf.statements[0];
  const directiveText =
    directive &&
    ts.isExpressionStatement(directive) &&
    ts.isStringLiteral(directive.expression)
      ? directive.expression.text
      : "";
  const info = {
    abs,
    isClient: directiveText === "use client",
    isServerAction: directiveText === "use server",
    imports: [],
    lazy: [],
    // what this module asks of the translators it makes
    uses: [], // { ns, entry, line }
    // what it hands to another module: { ns, group, target, line }
    // target: an absolute path, "self", or null (cannot be followed)
    passes: [],
    // what it asks of a translator it is GIVEN (namespace unknown here)
    givenUses: [], // { entry, line }
    problems: [],
  };
  moduleCache.set(abs, info);

  const lineOf = (node) =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const importedFrom = new Map(); // local name → absolute path

  // imports first: usage classification needs the whole map
  for (const st of sf.statements) {
    if (
      ts.isImportDeclaration(st) &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      !st.importClause?.isTypeOnly
    ) {
      const target = resolveImport(abs, st.moduleSpecifier.text);
      if (!target) continue;
      info.imports.push(target);
      const clause = st.importClause;
      if (clause?.name) importedFrom.set(clause.name.text, target);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        importedFrom.set(bindings.name.text, target);
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (!el.isTypeOnly) importedFrom.set(el.name.text, target);
        }
      }
    }
    if (
      ts.isExportDeclaration(st) &&
      st.moduleSpecifier &&
      ts.isStringLiteral(st.moduleSpecifier) &&
      !st.isTypeOnly
    ) {
      const target = resolveImport(abs, st.moduleSpecifier.text);
      if (target) info.imports.push(target);
    }
  }

  /** Where a called function or a rendered component lives. */
  const targetOf = (expression) => {
    let base = expression;
    while (ts.isPropertyAccessExpression(base)) base = base.expression;
    if (!ts.isIdentifier(base)) return null;
    if (importedFrom.has(base.text)) return importedFrom.get(base.text);
    if (base !== expression) return null; // a method of a local value
    const binding = findBinding(base.text, base);
    if (!binding) return null; // a global, or something we cannot see
    // A function or component written in this same file.
    if (ts.isFunctionDeclaration(binding)) return "self";
    if (
      ts.isVariableDeclaration(binding) &&
      binding.initializer &&
      (ts.isArrowFunction(binding.initializer) ||
        ts.isFunctionExpression(binding.initializer))
    ) {
      return "self";
    }
    return null;
  };

  /**
   * What happens to a translator at one place it is mentioned:
   * { entries } it is asked for keys, { target } it is handed on,
   * "ignore", or "unknown".
   */
  const usageOf = (id, group) => {
    const parent = id.parent;
    if (ts.isCallExpression(parent) && parent.expression === id) {
      return { entries: entriesOf(parent.arguments[0], group) };
    }
    if (ts.isPropertyAccessExpression(parent) && parent.expression === id) {
      const call = parent.parent;
      if (
        METHODS.has(parent.name.text) &&
        ts.isCallExpression(call) &&
        call.expression === parent
      ) {
        return { entries: entriesOf(call.arguments[0], group) };
      }
      return "unknown";
    }
    if (ts.isTypeQueryNode(parent)) return "ignore";

    // Climb out of { t }, [t], (t), t as X … to what receives it.
    let child = id;
    let node = parent;
    let viaArray = false;
    while (node) {
      if (
        ts.isShorthandPropertyAssignment(node) ||
        ts.isPropertyAssignment(node) ||
        ts.isObjectLiteralExpression(node) ||
        ts.isSpreadElement(node) ||
        ts.isSpreadAssignment(node) ||
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isNonNullExpression(node) ||
        ts.isSatisfiesExpression(node)
      ) {
        child = node;
        node = node.parent;
        continue;
      }
      if (ts.isArrayLiteralExpression(node)) {
        viaArray = child === id;
        child = node;
        node = node.parent;
        continue;
      }
      break;
    }
    if (!node) return "unknown";
    if (
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      node.arguments?.includes(child)
    ) {
      // useEffect(() => …, [t]): a dependency list, not a hand-over
      if (
        viaArray &&
        ts.isArrayLiteralExpression(child) &&
        ts.isIdentifier(node.expression) &&
        /^use[A-Z]/.test(node.expression.text) &&
        node.arguments[node.arguments.length - 1] === child
      ) {
        return "ignore";
      }
      return { target: targetOf(node.expression) };
    }
    if (ts.isJsxExpression(node) || ts.isJsxSpreadAttribute(node)) {
      let attrs = node.parent;
      if (ts.isJsxAttribute(attrs)) attrs = attrs.parent;
      if (attrs && ts.isJsxAttributes(attrs)) {
        return { target: targetOf(attrs.parent.tagName) };
      }
    }
    return "unknown";
  };

  const made = new Map(); // declaration → { ns, group }
  const noteFactory = (node) => {
    const factory = factoryOf(node);
    if (!factory) return null;
    if (factory.ns === null) {
      info.problems.push(
        `${rel(abs)}:${lineOf(node)}  the translator needs its namespace written as a string ("events"), so the pages that load it are known`,
      );
      return null;
    }
    return factory;
  };

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      // import("…"): next/dynamic, React.lazy
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        const lazyCall = (() => {
          for (let up = node.parent; up; up = up.parent) {
            if (
              ts.isCallExpression(up) &&
              ts.isIdentifier(up.expression) &&
              up.expression.text === "lazyWithMessages"
            ) {
              return up;
            }
            if (ts.isFunctionDeclaration(up) || ts.isSourceFile(up)) break;
          }
          return null;
        })();
        if (arg && ts.isStringLiteral(arg)) {
          const target = resolveImport(abs, arg.text);
          if (target && lazyCall) {
            const name = lazyCall.arguments[0];
            if (name && ts.isStringLiteralLike(name)) {
              info.lazy.push({ name: name.text, target, line: lineOf(node) });
            } else {
              info.problems.push(
                `${rel(abs)}:${lineOf(node)}  lazyWithMessages() needs its name written as a string`,
              );
            }
          } else if (target) {
            info.imports.push(target);
          }
        }
      }

      if (ts.isIdentifier(callee) && callee.text === "useValidationText") {
        info.uses.push({ ns: "validation", entry: WHOLE, line: lineOf(node) });
      }

      // A translator made and used on the spot, or handed straight on.
      const factory = factoryOf(node) && noteFactory(node);
      if (factory) {
        const holder = (() => {
          let up = node.parent;
          let inner = node;
          while (
            up &&
            (ts.isAwaitExpression(up) ||
              ts.isParenthesizedExpression(up) ||
              ts.isAsExpression(up) ||
              ts.isNonNullExpression(up))
          ) {
            inner = up;
            up = up.parent;
          }
          return { up, inner };
        })();
        const { up, inner } = holder;
        if (
          up &&
          ts.isVariableDeclaration(up) &&
          up.initializer === inner &&
          ts.isIdentifier(up.name)
        ) {
          made.set(up, factory);
          const statement = up.parent?.parent;
          const exported =
            statement &&
            ts.isVariableStatement(statement) &&
            statement.modifiers?.some(
              (m) => m.kind === ts.SyntaxKind.ExportKeyword,
            );
          if (exported) {
            info.uses.push({
              ns: factory.ns,
              entry: factory.group || WHOLE,
              line: lineOf(node),
              why: "the translator is exported",
            });
          }
        } else if (up && ts.isCallExpression(up) && up.expression === inner) {
          // translatorFor("common")("copied")
          for (const entry of entriesOf(up.arguments[0], factory.group)) {
            info.uses.push({ ns: factory.ns, entry, line: lineOf(node) });
          }
        } else {
          const usage = usageOf(inner, factory.group);
          if (usage !== "ignore" && usage !== "unknown" && "target" in usage) {
            info.passes.push({
              ...factory,
              target: usage.target,
              line: lineOf(node),
            });
          } else {
            info.uses.push({
              ns: factory.ns,
              entry: factory.group || WHOLE,
              line: lineOf(node),
              why: "the translator is not kept in a variable",
            });
          }
        }
      }

      // A translator this module was GIVEN: ctx.t("key"), t("key") where t
      // is a parameter. Its namespace is whatever the caller made it for.
      let subject = callee;
      if (
        ts.isPropertyAccessExpression(subject) &&
        METHODS.has(subject.name.text)
      ) {
        subject = subject.expression;
      }
      let given = false;
      let named = false;
      if (ts.isIdentifier(subject)) {
        const binding = findBinding(subject.text, subject);
        const isMade = binding && made.has(binding);
        const isFactoryVar =
          binding &&
          ts.isVariableDeclaration(binding) &&
          binding.initializer &&
          factoryOf(binding.initializer);
        if (!isMade && !isFactoryVar && !importedFrom.has(subject.text)) {
          named = looksLikeTranslator(subject.text);
          given = named || (binding ? ts.isParameter(binding) : false);
        }
      } else if (
        ts.isPropertyAccessExpression(subject) &&
        looksLikeTranslator(subject.name.text)
      ) {
        given = true;
        named = true;
      }
      if (given) {
        const arg = node.arguments[0];
        const literal =
          arg && (ts.isStringLiteralLike(arg) || ts.isTemplateExpression(arg));
        if (literal || (named && arg)) {
          for (const entry of entriesOf(arg, "")) {
            info.givenUses.push({ entry, line: lineOf(node) });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Every mention of a translator this module made.
  const mentions = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isName =
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isJsxAttribute(parent) && parent.name === node) ||
        ts.isBindingElement(parent) ||
        ts.isParameter(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isExportSpecifier(parent);
      if (!isName) {
        const binding = findBinding(node.text, node);
        const translator = binding && made.get(binding);
        if (translator) {
          const usage = usageOf(node, translator.group);
          const line = lineOf(node);
          if (usage === "unknown") {
            info.uses.push({
              ns: translator.ns,
              entry: translator.group || WHOLE,
              line,
              why: "the translator is stored or handed to something that cannot be followed",
            });
          } else if (usage !== "ignore" && "entries" in usage) {
            for (const entry of usage.entries) {
              info.uses.push({
                ns: translator.ns,
                entry,
                line,
                why:
                  entry === (translator.group || WHOLE)
                    ? "the key is decided at run time"
                    : undefined,
              });
            }
          } else if (usage !== "ignore") {
            info.passes.push({ ...translator, target: usage.target, line });
          }
        }
      }
    }
    ts.forEachChild(node, mentions);
  };
  mentions(sf);

  return info;
}

/** The keys a module, and everything it imports, reads from a given translator. */
const givenCache = new Map();
function givenKeys(abs) {
  const cached = givenCache.get(abs);
  if (cached) return cached;
  const out = new Map(); // entry → "file:line"
  const seen = new Set();
  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    const info = readModule(current);
    if (info.isServerAction) continue;
    for (const use of info.givenUses) {
      if (!out.has(use.entry))
        out.set(use.entry, `${rel(current)}:${use.line}`);
    }
    stack.push(...info.imports);
  }
  givenCache.set(abs, out);
  return out;
}

// ── a selection: namespace → entries ─────────────────────────────────

class Selection {
  constructor() {
    this.map = new Map(); // ns → Map(entry → reason)
  }
  add(ns, entry, reason) {
    let entries = this.map.get(ns);
    if (!entries) {
      entries = new Map();
      this.map.set(ns, entries);
    }
    if (!entries.has(entry)) entries.set(entry, reason);
  }
  isWhole(ns) {
    return this.map.get(ns)?.has(WHOLE) ?? false;
  }
  has(ns, entry) {
    return this.map.get(ns)?.has(entry) ?? false;
  }
  namespaces() {
    return [...this.map.keys()].sort();
  }
  /** What goes in the file: "*" or a sorted list of entries. */
  toJSON(without) {
    const out = {};
    for (const ns of this.namespaces()) {
      if (without?.isWhole(ns)) continue;
      if (this.isWhole(ns)) {
        out[ns] = WHOLE;
        continue;
      }
      const entries = [...this.map.get(ns).keys()]
        .filter((entry) => !without?.has(ns, entry))
        .sort();
      if (entries.length) out[ns] = entries;
    }
    return out;
  }
}

/**
 * What the browser reads on the client side of the "use client" boundary,
 * from everything reachable from `entries`.
 */
function clientSelection(entries, problems, lazyFound) {
  const selection = new Selection();
  const seen = new Set();
  const queue = entries.map((abs) => ({ abs, client: false }));
  while (queue.length) {
    const { abs, client } = queue.pop();
    const info = readModule(abs);
    if (info.isServerAction) continue;
    const inClient = client || info.isClient;
    const key = `${abs}|${inClient ? "c" : "s"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (inClient) {
      const where = rel(abs);
      for (const use of info.uses) {
        selection.add(
          use.ns,
          use.entry,
          `${where}:${use.line}${use.why ? `  (${use.why})` : ""}`,
        );
      }
      for (const pass of info.passes) {
        const at = `${where}:${pass.line}`;
        if (pass.target === null) {
          selection.add(
            pass.ns,
            pass.group || WHOLE,
            `${at}  (handed to something that cannot be followed)`,
          );
          continue;
        }
        const target = pass.target === "self" ? abs : pass.target;
        for (const [entry, from] of givenKeys(target)) {
          const full =
            entry === WHOLE
              ? pass.group || WHOLE
              : pass.group
                ? `${pass.group}.${entry}`
                : entry;
          selection.add(
            pass.ns,
            full,
            `${at} -> ${from}${entry === WHOLE ? "  (asked for a key decided at run time)" : ""}`,
          );
        }
      }
      for (const problem of info.problems) problems.add(problem);
      for (const lazy of info.lazy) lazyFound.push({ ...lazy, from: where });
    }
    for (const target of info.imports)
      queue.push({ abs: target, client: inClient });
    // A lazy boundary's code is still client code; it is analysed on its own.
  }
  return selection;
}

// ── catalogs ─────────────────────────────────────────────────────────

const catalogNames = readdirSync(join(MESSAGES, "en"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(/\.json$/, ""));
const SERVER_ONLY = new Set(["server", "emails"]);
const known = new Set(catalogNames);
const catalogCache = new Map();
const catalog = (locale, ns) => {
  const key = `${locale}/${ns}`;
  if (!catalogCache.has(key)) {
    catalogCache.set(
      key,
      JSON.parse(readFileSync(join(MESSAGES, locale, `${ns}.json`), "utf8")),
    );
  }
  return catalogCache.get(key);
};

/** The same rule as apps/web/src/i18n/pickMessages.ts, for the report. */
function pick(messages, entries) {
  if (entries === WHOLE) return messages;
  const out = {};
  const copy = (path) => {
    let from = messages;
    let to = out;
    for (let i = 0; i < path.length; i++) {
      if (from === null || typeof from !== "object" || !(path[i] in from))
        return;
      from = from[path[i]];
      if (i === path.length - 1) to[path[i]] = from;
      else {
        if (typeof to[path[i]] !== "object" || to[path[i]] === null)
          to[path[i]] = {};
        to = to[path[i]];
      }
    }
  };
  for (const entry of entries) {
    if (!entry.endsWith("*")) {
      copy(entry.split("."));
      continue;
    }
    const parts = entry.slice(0, -1).split(".");
    const start = parts.pop();
    let group = messages;
    for (const part of parts) group = group?.[part];
    if (!group || typeof group !== "object") continue;
    for (const name of Object.keys(group)) {
      if (name.startsWith(start)) copy([...parts, name]);
    }
  }
  return out;
}

function sizeOf(selection, locale = "fr") {
  let bytes = 0;
  for (const [ns, entries] of Object.entries(selection)) {
    if (!known.has(ns)) continue;
    bytes += JSON.stringify(pick(catalog(locale, ns), entries)).length;
  }
  return bytes;
}

// ── route files ──────────────────────────────────────────────────────

function routeFilesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFilesUnder(p));
    else if (ROUTE_FILES.has(entry.name)) out.push(p);
  }
  return out;
}

const directRouteFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && ROUTE_FILES.has(e.name))
    .map((e) => join(dir, e.name));

const problems = new Set();
const lazyFound = [];

// The shell and the chrome every page is drawn inside.
const rootEntries = [
  join(APP, "AppShell.tsx"),
  ...["global-not-found.tsx"].map((f) => join(APP, f)).filter(existsSync),
  ...directRouteFiles(LOCALE_DIR),
  ...directRouteFiles(PAGES_DIR),
];
const rootSelection = clientSelection(rootEntries, problems, lazyFound);

// One segment per directory directly under [locale] and under (pages).
const segmentDirs = [
  ...readdirSync(LOCALE_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "(pages)")
    .map((e) => ({ name: e.name, dir: join(LOCALE_DIR, e.name) })),
  ...readdirSync(PAGES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, dir: join(PAGES_DIR, e.name) })),
].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

const segmentSelections = {};
for (const { name, dir } of segmentDirs) {
  const files = routeFilesUnder(dir);
  if (files.length === 0) continue;
  segmentSelections[name] = clientSelection(files, problems, lazyFound);
}

// Lazy boundaries: whole namespaces, fetched when the boundary first opens.
const lazy = {};
const lazyTargets = new Map();
for (let i = 0; i < lazyFound.length; i++) {
  const { name, target, from, line } = lazyFound[i];
  const before = lazyTargets.get(name);
  if (before && before !== target) {
    problems.add(
      `${from}:${line}  lazyWithMessages("${name}") is already the name of ${rel(before)}`,
    );
    continue;
  }
  if (before) continue;
  lazyTargets.set(name, target);
  // What opens inside a lazy boundary may hold another one.
  const inner = [];
  const selection = clientSelection([target], problems, inner);
  // The boundary's own file may not say "use client" (its importer does).
  const asClient = new Selection();
  const queue = [target];
  const seen = new Set();
  while (queue.length) {
    const abs = queue.pop();
    if (seen.has(abs)) continue;
    seen.add(abs);
    const info = readModule(abs);
    if (info.isServerAction) continue;
    for (const use of info.uses) asClient.add(use.ns, WHOLE, "");
    for (const pass of info.passes) asClient.add(pass.ns, WHOLE, "");
    for (const more of info.lazy) inner.push({ ...more, from: rel(abs) });
    queue.push(...info.imports);
  }
  lazy[name] = [
    ...new Set([...selection.namespaces(), ...asClient.namespaces()]),
  ].sort();
  lazyFound.push(...inner);
}

// Every namespace must exist; a typo would silently ship nothing.
const allSelections = [rootSelection, ...Object.values(segmentSelections)];
for (const ns of new Set([
  ...allSelections.flatMap((s) => s.namespaces()),
  ...Object.values(lazy).flat(),
])) {
  if (!known.has(ns)) problems.add(`namespace "${ns}" has no catalog file`);
  if (SERVER_ONLY.has(ns)) {
    problems.add(
      `namespace "${ns}" is for the server and must not reach the browser`,
    );
  }
}

// ── --why ────────────────────────────────────────────────────────────

if (WHY) {
  const selection = WHY_SEGMENT
    ? segmentSelections[WHY_SEGMENT]
    : rootSelection;
  if (!selection) {
    console.error(`no segment "${WHY_SEGMENT}"`);
    process.exit(1);
  }
  const entries = selection.map.get(WHY);
  const scope = WHY_SEGMENT ? `the ${WHY_SEGMENT} pages` : "every page";
  if (!entries) {
    console.log(`${WHY} is not sent to ${scope}.`);
    process.exit(0);
  }
  const whole = entries.get(WHOLE);
  console.log(
    whole !== undefined
      ? `${WHY} is sent whole to ${scope}:`
      : `${entries.size} entries of ${WHY} are sent to ${scope}:`,
  );
  const rows = [...entries].filter(
    ([entry, reason]) =>
      whole === undefined || entry === WHOLE || / \(/.test(reason),
  );
  for (const [entry, reason] of rows.sort()) {
    console.log(`  ${entry.padEnd(36)} ${reason}`);
  }
  process.exit(0);
}

// ── every segment's layout must hand its messages over ───────────────

const unwired = [];
for (const { name, dir } of segmentDirs) {
  if (!(name in segmentSelections)) continue;
  const layout = join(dir, "layout.tsx");
  const wired =
    existsSync(layout) &&
    readFileSync(layout, "utf8").includes(`<SegmentMessages segment="${name}"`);
  if (!wired) {
    unwired.push(
      `${rel(layout)}  must wrap its children in <SegmentMessages segment="${name}">, or its pages wait for their words`,
    );
  }
}

// ── output ───────────────────────────────────────────────────────────

// The committed files are Biome-formatted (the pre-commit hook would do it
// anyway), so a fresh run leaves nothing for it to change.
function biomeFormat(path, content) {
  return execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules/@biomejs/biome/bin/biome"),
      "format",
      `--stdin-file-path=${path}`,
    ],
    { input: content, encoding: "utf8", cwd: ROOT },
  );
}

// The key lists stay on the server. The browser only needs to know which
// namespaces a lazy boundary fetches, so that list is a file of its own.
const data = {
  root: rootSelection.toJSON(),
  segments: Object.fromEntries(
    Object.entries(segmentSelections).map(([name, selection]) => [
      name,
      selection.toJSON(rootSelection),
    ]),
  ),
};
const lazyData = Object.fromEntries(
  Object.keys(lazy)
    .sort()
    .map((name) => [name, lazy[name]]),
);

if (REPORT) {
  const kb = (bytes) => `${(bytes / 1024).toFixed(1).padStart(6)} KB`;
  const everything = catalogNames
    .filter((ns) => !SERVER_ONLY.has(ns))
    .reduce((n, ns) => n + JSON.stringify(catalog("fr", ns)).length, 0);
  const wholeOf = (selection) =>
    Object.entries(selection)
      .filter(([, entries]) => entries === WHOLE)
      .map(([ns]) => ns);
  console.log(`before: every page carried ${kb(everything)} of French`);
  console.log(
    `every page now: ${kb(sizeOf(data.root))}   whole: ${wholeOf(data.root).join(", ") || "none"}`,
  );
  for (const [name, selection] of Object.entries(data.segments)) {
    console.log(
      `  ${name.padEnd(20)} +${kb(sizeOf(selection))}   whole: ${wholeOf(selection).join(", ") || "none"}`,
    );
  }
  for (const [name, namespaces] of Object.entries(lazyData)) {
    console.log(`  lazy ${name.padEnd(22)} ${namespaces.join(", ")}`);
  }
}

if (CHECK) {
  const same = (path, value) =>
    existsSync(path) &&
    JSON.stringify(JSON.parse(readFileSync(path, "utf8"))) ===
      JSON.stringify(value);
  const stale = !same(OUT, data) || !same(OUT_LAZY, lazyData);
  const all = [...problems, ...unwired];
  if (stale || all.length) {
    if (stale) {
      console.error(
        "apps/web/src/i18n/routeMessages.generated.json is out of date (a translation was added to, or removed from, a page): run node scripts/i18n/gen-route-messages.mjs",
      );
    }
    for (const problem of all) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log(
    `route messages: ${Object.keys(data.segments).length} segments and ${Object.keys(lazyData).length} lazy boundaries, up to date and wired.`,
  );
} else {
  writeFileSync(OUT, biomeFormat(OUT, JSON.stringify(data)));
  writeFileSync(OUT_LAZY, biomeFormat(OUT_LAZY, JSON.stringify(lazyData)));
  console.log(
    `route messages: ${Object.keys(data.segments).length} segments and ${Object.keys(lazyData).length} lazy boundaries written.`,
  );
  for (const problem of problems) console.error(`  ${problem}`);
  if (unwired.length) {
    console.error(`${unwired.length} segment layouts still to wire:`);
    for (const problem of unwired) console.error(`  ${problem}`);
  }
  if (problems.size) process.exit(1);
}
