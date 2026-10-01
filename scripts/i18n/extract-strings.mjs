#!/usr/bin/env node
// Finds English text written straight into components and, with --apply,
// moves it into the translation catalogs and rewrites the component to read
// it back through `t()`.
//
//   node scripts/i18n/extract-strings.mjs --target web            # report only
//   node scripts/i18n/extract-strings.mjs --target web --apply    # rewrite
//   node scripts/i18n/extract-strings.mjs --target mobile --only features/tickets
//   node scripts/i18n/extract-strings.mjs --target web --check    # CI: fail if any remain
//
// What counts as user-facing text:
//   * JSX text children ("Save changes", "No tickets yet") — including runs
//     that mix text with expressions ("Hi {name}") and simple inline
//     elements ("Read the <Link>terms</Link>"), which become one ICU
//     message with params / rich tags instead of three fragments;
//   * string values of the attributes people read (placeholder, title, alt,
//     aria-label, accessibilityLabel, …), including conditional ones;
//   * string arguments of toast.*/Alert.alert/set*Error-style calls;
//   * string values of label/title/description/message… keys in object
//     literals written inside a component.
//
// Anything it cannot rewrite safely (module-scope constants, class
// components, helpers outside a component) is listed in the report for a
// hand edit. The CI mode (--check) treats every remaining literal as a
// failure unless it is listed in scripts/i18n/allowlist.json.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MESSAGES_DIR = join(ROOT, "packages/i18n/messages");
const ALLOWLIST_PATH = join(ROOT, "scripts/i18n/allowlist.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const target = option("target") ?? "web";
const APPLY = flag("apply");
const CHECK = flag("check");
const ONLY = option("only");
const REPORT_PATH = option("report");
const VERBOSE = flag("verbose");
// { "<file>": ["<text>", …] } — strings to move to the catalogs even
// though they sit in a position this script does not recognise as text
// (a `what="your tickets"` prop, an array element, a `kicker` variable).
// check-literals.mjs --json writes the file.
const FORCE_PATH = option("force");
// --module-keys <out.json>: a forced literal at module scope (a label map,
// a list of choices) cannot call a hook where it stands. Its text moves to
// the catalog and the literal becomes the catalog KEY; the component that
// renders it wraps the value in t(). The output file lists every such key
// with the constant that owns it, so each render site can be found.
const MODULE_KEYS_PATH = option("module-keys");
const moduleKeys = [];
const FORCE = FORCE_PATH
  ? JSON.parse(readFileSync(resolve(FORCE_PATH), "utf8"))
  : {};

// ---------------------------------------------------------------------------
// Target configuration
// ---------------------------------------------------------------------------

const TARGETS = {
  web: {
    roots: ["apps/web/src"],
    exclude: [
      "apps/web/src/app/api/",
      "apps/web/src/actions/",
      "apps/web/src/i18n/",
      "apps/web/src/content/",
      "apps/web/src/lib/email/",
      "apps/web/src/instrumentation",
      "apps/web/src/sentry.",
      "apps/web/src/proxy.ts",
      "apps/web/src/config/",
      "apps/web/src/components/ui/",
      "EmailTemplate",
      "EmailParts",
      "generateTicketPdfBuffer",
      ".test.",
      ".d.ts",
    ],
    extensions: [".tsx", ".ts"],
    hookImport: { name: "useTranslations", from: "next-intl" },
    asyncImport: { name: "getTranslations", from: "next-intl/server" },
    // Browser-only helpers (a click handler in a .ts module) cannot call a
    // hook: they ask the provider's translator at call time.
    moduleTranslator: { name: "translatorFor", from: "@/i18n/clientTranslator" },
    namespaceFor(file) {
      const rel = file.replace(/\\/g, "/").replace(/^apps\/web\/src\//, "");
      const seg = rel.split("/").filter((s) => s !== "[locale]");
      if (seg[0] === "app") {
        const groupMap = {
          landing: "landing",
          settings: "settings",
          finances: "finances",
          transactions: "transactions",
          userPage: "account",
        };
        for (const s of seg) {
          const name = s.match(/^\((.+)\)$/)?.[1];
          if (name && groupMap[name]) return groupMap[name];
        }
        const first = seg
          .slice(1)
          .find((s) => !/^[\(\[]/.test(s) && !s.endsWith(".tsx"));
        return WEB_PAGE_NAMESPACES[first ?? ""] ?? (first ? first : "common");
      }
      const map = {
        components: "common",
        hooks: "common",
        utils: "common",
        providers: "common",
        userAccount: "account",
        landingPage: "landing",
        fieldOps: "fieldOps",
        messaging: "messaging",
      };
      return map[seg[0]] ?? seg[0];
    },
  },
  mobile: {
    roots: ["apps/mobile/app", "apps/mobile/src", "packages/ui-native/src"],
    exclude: [
      ".test.",
      ".d.ts",
      "packages/ui-native/src/i18n/",
      "packages/ui-native/src/primitives/brandPaths.ts",
      "+native-intent",
    ],
    extensions: [".tsx", ".ts"],
    hookImport: { name: "useTranslations", from: "@abonten/ui-native/i18n" },
    asyncImport: null,
    moduleTranslator: {
      name: "translatorFor",
      from: "@abonten/ui-native/i18n",
    },
    namespaceFor(file) {
      const rel = file.replace(/\\/g, "/");
      if (rel.startsWith("packages/ui-native/")) return "common";
      if (rel.startsWith("apps/mobile/app/(auth)")) return "auth";
      const m = rel.match(
        /^apps\/mobile\/app\/\(app\)\/(?:\(tabs\)\/)?([^/]+)/,
      );
      if (m) {
        const seg = m[1].replace(/\.tsx$/, "");
        return MOBILE_ROUTE_NAMESPACES[seg] ?? seg;
      }
      if (rel.startsWith("apps/mobile/app/")) return "common";
      const c = rel.match(
        /^apps\/mobile\/src\/(components|features|auth)\/([^/]+)/,
      );
      if (c) {
        if (c[1] === "auth") return "auth";
        const seg = c[2].replace(/\.tsx$/, "");
        if (seg.endsWith(".tsx") || !rel.includes(`/${c[2]}/`)) return "common";
        return MOBILE_FOLDER_NAMESPACES[seg] ?? seg;
      }
      return "common";
    },
  },
};

const WEB_PAGE_NAMESPACES = {
  auth: "auth",
  checkout: "checkout",
  consent: "fieldOps",
  events: "events",
  explore: "explore",
  field: "fieldOps",
  "for-you": "discovery",
  help: "help",
  invite: "rewards",
  legal: "legal",
  manage: "manage",
  messages: "messaging",
  notifications: "notifications",
  places: "places",
  plans: "plans",
  rewards: "rewards",
  search: "search",
  spotlight: "spotlight",
  stories: "spotlight",
  unsubscribe: "notifications",
  "user-account": "account",
  wallet: "wallet",
  weekly: "weekly",
  "account-restricted": "auth",
  "": "common",
};

const MOBILE_ROUTE_NAMESPACES = {
  index: "explore",
  account: "account",
  messages: "messaging",
  search: "search",
  spotlight: "spotlight",
  bookings: "places",
  buy: "checkout",
  checkout: "checkout",
  event: "events",
  explore: "explore",
  "for-you": "discovery",
  highlight: "profile",
  invite: "rewards",
  notifications: "notifications",
  organizer: "manage",
  payment: "wallet",
  place: "places",
  places: "places",
  reviews: "reviews",
  rewards: "rewards",
  settings: "settings",
  story: "spotlight",
  ticket: "tickets",
  tickets: "tickets",
  transactions: "transactions",
  user: "profile",
  wallet: "wallet",
  weekly: "weekly",
  _layout: "common",
};

const MOBILE_FOLDER_NAMESPACES = {
  app: "common",
  cards: "common",
  datetime: "common",
  skeletons: "common",
  content: "spotlight",
  messaging: "messaging",
  promotions: "manage",
  organizer: "manage",
  roles: "manage",
  uploads: "common",
  markets: "explore",
  favorites: "account",
  alerts: "notifications",
  map: "explore",
  filters: "explore",
  reminders: "events",
  reports: "common",
};

// Attributes whose string value a person reads or hears.
const TEXT_ATTRIBUTES = new Set([
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "label",
  "description",
  "subtitle",
  "message",
  "hint",
  "helperText",
  "helper",
  "emptyTitle",
  "emptyDescription",
  "emptyMessage",
  "emptyBody",
  "emptyLabel",
  "errorTitle",
  "errorMessage",
  "errorText",
  "successMessage",
  "cta",
  "ctaLabel",
  "actionLabel",
  "buttonLabel",
  "buttonText",
  "confirmLabel",
  "confirmText",
  "cancelLabel",
  "cancelText",
  "submitLabel",
  "loadingLabel",
  "loadingText",
  "tooltip",
  "caption",
  "heading",
  "headline",
  "body",
  "text",
  "accessibilityLabel",
  "accessibilityHint",
  "headerTitle",
  "sheetTitle",
  "modalTitle",
  "legend",
  "badge",
  "badgeLabel",
  "footer",
  "footnote",
  "note",
  "prompt",
  "question",
  "summary",
  "eyebrow",
  "kicker",
  "detail",
  "details",
  "secondaryLabel",
  "primaryLabel",
  "retryLabel",
  "unit",
  "suffix",
  "prefix",
]);

// Object keys whose string value a person reads.
const TEXT_OBJECT_KEYS = new Set([
  ...TEXT_ATTRIBUTES,
  "name",
  "emptyState",
  "warning",
  "info",
  "success",
  "error",
  "placeholderText",
  "cancelButtonText",
  "confirmButtonText",
  "okText",
]);

// Keys that are never text even though they appear above.
const NEVER_KEYS = new Set(["name"]);

// Calls whose string arguments a person reads: callee text matched against
// these patterns.
// Variables and functions whose value a person reads.
const TEXTISH_NAME =
  /(label|title|text|message|description|subtitle|heading|headline|hint|placeholder|caption|copy|note|summary|reason|tooltip|cta|prompt|error|warning|body|emptyState|helper)$/i;

const TEXT_CALLS = [
  /^toast\.(success|error|warning|info|loading|show|message)$/,
  /^Alert\.alert$/,
  /^(window\.)?confirm$/,
  /^messageOf$/,
  /^set(?:[A-Z]\w*)?(Error|Errors|Message|Status|Hint|Notice|Label|Title|Text|Reason|Feedback|Warning|Success|Caption|Placeholder)$/,
  /^(show|notify|announce)[A-Z]\w*$/,
];

// Strings never worth translating.
function isNoiseText(text, { attribute } = {}) {
  const t = text.trim();
  if (t.length < 2) return true;
  if (!/\p{L}/u.test(t)) return true;
  if (/^[A-Z0-9_\-:.]+$/.test(t) && !/[a-z]/.test(t) && t.length <= 8)
    return true;
  if (/^(https?:\/\/|mailto:|tel:|\/|#|www\.)/i.test(t)) return true;
  // A catalog key ("footer.privacy", "tabs.all", "payoutAccounts2") already
  // points at text.
  if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)*$/.test(t)) return true;
  if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return true;
  if (
    /^(abonten|abonten hub|abonten hub ltd|ab[ɔo]nten|paystack|google|apple|x|instagram|tiktok|facebook|linkedin|cloudinary|hubtel|resend|supabase|sentry|expo|ios|android|whatsapp|momo|mtn|vodafone|airteltigo|telecel|visa|mastercard|ghs|gh₵|usd|eur|gbp|xof|ngn|kes|png|jpg|jpeg|pdf|mp4|svg|utc|gmt|qr|id|ok|px|km|mi|kg|cm|mm|am|pm|a\.m\.|p\.m\.|n\/a|vs|etc\.?|e\.g\.|i\.e\.|vat|nhil|getfund|ltd|llc|inc|t&c|faq|sms|otp|url|api|pin|cvv|cvc|iban|swift|bic|ussd|rsvp|diy|ceo|cto|cfo|hq|dj|mc|vip|vvip|tv|hd|4k|3d|2d|ui|ux|seo|csv|json|xml|html|css|js|ts|tsx|ai|ar|vr|nft|crypto|btc|eth)$/i.test(
      t,
    )
  )
    return true;
  if (attribute === "alt" && /^(abonten|logo|avatar)$/i.test(t)) return true;
  // Tailwind class lists ("text-[15px] leading-[22px] font-semibold").
  if (
    /^[a-z0-9\-\[\]\/\.:%#()!,]+( [a-z0-9\-\[\]\/\.:%#()!,]+)*$/.test(t) &&
    /[-\[:]/.test(t) &&
    !/\s[a-z]+\s/.test(` ${t} `.replace(/\s\S*[-\[:]\S*\s/g, " "))
  )
    return true;
  return false;
}

// ---------------------------------------------------------------------------
// Catalog helpers
// ---------------------------------------------------------------------------

const LOCALES = readdirSync(MESSAGES_DIR).filter((d) => !d.includes("."));

function readCatalog(locale, namespace) {
  const p = join(MESSAGES_DIR, locale, `${namespace}.json`);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf8"));
}

function writeCatalog(locale, namespace, data) {
  const p = join(MESSAGES_DIR, locale, `${namespace}.json`);
  writeFileSync(p, `${JSON.stringify(sortKeys(data), null, 2)}\n`);
}

function sortKeys(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, sortKeys(obj[k])]),
  );
}

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && !Array.isArray(v))
      flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

// A hook's namespace may be nested ("settings.security.phone"): the catalog
// file is the first segment and the rest prefixes every key.
function splitNamespace(ns) {
  const [file, ...rest] = ns.split(".");
  return { file, prefix: rest.length ? `${rest.join(".")}.` : "" };
}

// One registry per catalog file: existing English keys + what this run adds.
const catalogs = new Map(); // file -> { en: flatMap, textToKey: Map<prefix+text, key>, added: Map }

function registry(file) {
  let r = catalogs.get(file);
  if (!r) {
    const en = flatten(readCatalog("en", file));
    const textToKey = new Map();
    for (const [k, v] of Object.entries(en)) {
      if (typeof v !== "string") continue;
      const prefix = k.includes(".")
        ? `${k.slice(0, k.lastIndexOf(".") + 1)}`
        : "";
      const id = `${prefix}\u0000${v}`;
      if (!textToKey.has(id)) textToKey.set(id, k);
    }
    r = { en, textToKey, added: new Map() };
    catalogs.set(file, r);
  }
  return r;
}

function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null)
      cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

const RESERVED_WORDS = new Set([
  "default",
  "delete",
  "new",
  "class",
  "function",
  "return",
  "import",
  "export",
  "const",
  "let",
  "var",
  "if",
  "else",
  "for",
  "while",
  "do",
  "switch",
  "case",
  "break",
  "continue",
  "this",
  "typeof",
  "void",
  "in",
  "of",
  "with",
  "try",
  "catch",
  "finally",
  "throw",
  "null",
  "true",
  "false",
]);

function slugFor(text) {
  const words = text
    .toLowerCase()
    .replace(/\{[^}]*\}/g, " ")
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (words.length === 0) return "text";
  let slug = words
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("");
  if (/^\d/.test(slug)) slug = `n${slug}`;
  if (RESERVED_WORDS.has(slug)) slug = `${slug}Text`;
  return slug.slice(0, 48);
}

// Returns the key RELATIVE to the hook's namespace (what goes in t("…")).
function keyFor(ns, text) {
  const { file, prefix } = splitNamespace(ns);
  const r = registry(file);
  const id = `${prefix}\u0000${text}`;
  const existing = r.textToKey.get(id);
  if (existing) return existing.slice(prefix.length);
  const base = slugFor(text);
  let key = `${prefix}${base}`;
  let n = 2;
  // A key must not collide with an existing leaf, nor sit where a nested
  // group already lives ("appearance" beside "appearance.title"): the JSON
  // can hold only one of the two.
  const taken = (k) =>
    k in r.en ||
    r.added.has(k) ||
    Object.keys(r.en).some((e) => e.startsWith(`${k}.`)) ||
    [...r.added.keys()].some((e) => e.startsWith(`${k}.`));
  while (taken(key)) {
    key = `${prefix}${base}${n++}`;
  }
  r.added.set(key, text);
  r.textToKey.set(id, key);
  return key.slice(prefix.length);
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

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

const cfg = TARGETS[target];
if (!cfg) {
  console.error(`Unknown target ${target}`);
  process.exit(2);
}

// A plain .ts module that only ever runs on the server (it reads cookies,
// holds the service-role client, calls the services package) words its
// messages with tr() from @abonten/services/i18n/requestLocale, not with a
// React translator: scripts/i18n/extract-server-messages.mjs owns it.
const SERVER_ONLY_IMPORT =
  /from "(server-only|next\/headers|next\/server|@\/config\/supabase\/(server|serviceClient)|@abonten\/services\/[^"]+|node:[a-z_/]+|resend|@react-pdf\/renderer)"|^import "server-only";|^"use server";/m;

function isServerModule(file) {
  if (!file.endsWith(".ts")) return false;
  const source = readFileSync(join(ROOT, file), "utf8");
  return SERVER_ONLY_IMPORT.test(source);
}

const files = cfg.roots
  .flatMap((r) => walk(join(ROOT, r), []))
  .map((f) => relative(ROOT, f).split(sep).join("/"))
  .filter((f) => cfg.extensions.some((e) => f.endsWith(e)))
  .filter((f) => !cfg.exclude.some((x) => f.includes(x)))
  .filter((f) => !ONLY || f.includes(ONLY))
  .filter((f) => !isServerModule(f))
  .sort();

const allowlist = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  : { texts: [], files: [] };
const allowTexts = new Set(allowlist.texts ?? []);
const allowFiles = allowlist.files ?? [];

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

const ENTITIES = {
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&amp;": "&",
  "&nbsp;": " ",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
  "&middot;": "·",
  "&bull;": "•",
  "&copy;": "©",
  "&times;": "×",
  "&rarr;": "→",
  "&larr;": "←",
  "&lt;": "<",
  "&gt;": ">",
};

function decodeEntities(s) {
  return s.replace(/&[a-z]+;|&#\d+;/gi, (m) => {
    if (ENTITIES[m]) return ENTITIES[m];
    const num = m.match(/^&#(\d+);$/);
    return num ? String.fromCodePoint(Number(num[1])) : m;
  });
}

// JSX whitespace rules: lines are trimmed, a line break between words is a
// single space, leading/trailing whitespace on the same line as a sibling is
// kept as one space.
function jsxTextParts(raw) {
  const lines = raw.split("\n");
  const leading =
    /^[ \t]/.test(raw) && !raw.startsWith("\n") && lines.length === 1
      ? " "
      : "";
  const trailing =
    /[ \t]$/.test(raw) && !raw.endsWith("\n") && lines.length === 1 ? " " : "";
  if (lines.length === 1) return { text: raw.trim(), leading, trailing };
  // multi-line: first line keeps leading space only if it has non-space
  // content on it; same for the last line.
  const first = lines[0];
  const last = lines[lines.length - 1];
  const lead = first.trim() !== "" && /^[ \t]/.test(first) ? " " : "";
  const trail = last.trim() !== "" && /[ \t]$/.test(last) ? " " : "";
  const text = lines
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .join(" ");
  return { text, leading: lead, trailing: trail };
}

function isComponentName(name) {
  return !!name && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name));
}

function nameOfFunction(fn) {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if (ts.isFunctionExpression(fn) && fn.name) return fn.name.text;
  let p = fn.parent;
  // const X = () => …   |   const X = memo(() => …)   |   const X = forwardRef(function …)
  while (
    p &&
    (ts.isCallExpression(p) ||
      ts.isParenthesizedExpression(p) ||
      ts.isAsExpression(p) ||
      ts.isSatisfiesExpression?.(p))
  )
    p = p.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name))
    return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name))
    return p.name.text;
  if (p && ts.isExportAssignment(p)) return "Default";
  return undefined;
}

function isFunctionLike(n) {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isFunctionExpression(n) ||
    ts.isArrowFunction(n) ||
    ts.isMethodDeclaration(n)
  );
}

function containsJsx(node) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function isModuleLevel(fn) {
  let p = fn.parent;
  while (p && !ts.isSourceFile(p)) {
    if (isFunctionLike(p) || ts.isClassDeclaration(p)) return false;
    p = p.parent;
  }
  return true;
}

// Module-level functions that may host `const t = await getTranslations()`
// even though they are not components.
const SERVER_HOST_FUNCTIONS = new Set(["generateMetadata"]);

// The component (or hook) whose body a `t` can live in, for a node inside it.
function findComponentAncestor(node) {
  let n = node.parent;
  let candidate = null;
  // A default value in a component's parameter list runs before the body,
  // where `t` would be declared.
  for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
    if (
      ts.isParameter(p) ||
      (ts.isBindingElement(p) && p.initializer && isInsideParameter(p))
    ) {
      return { fn: null, reason: "parameter default" };
    }
    if (isFunctionLike(p) || ts.isBlock(p)) break;
  }
  while (n && !ts.isSourceFile(n)) {
    if (ts.isClassDeclaration(n))
      return { fn: null, reason: "class component" };
    if (isFunctionLike(n)) {
      const name = nameOfFunction(n);
      const isDefaultExport =
        ts.isFunctionDeclaration(n) &&
        n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      const isAsyncInner =
        !cfg.asyncImport &&
        !isModuleLevel(n) &&
        !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
      if ((isComponentName(name) || isDefaultExport) && !isAsyncInner)
        return { fn: n, name: name ?? "default" };
      if (name && SERVER_HOST_FUNCTIONS.has(name) && isModuleLevel(n))
        return { fn: n, name };
      if (isModuleLevel(n)) {
        // A module-level helper that returns JSX (e.g. `function renderRow()`)
        // cannot host a hook unless it is itself a component.
        if (containsJsx(n) && !name) return { fn: n, name: "anonymous" };
        return {
          fn: null,
          reason: `inside module-level function ${name ?? "(anonymous)"}`,
        };
      }
      candidate = n;
    }
    n = n.parent;
  }
  return { fn: null, reason: "module scope" };
}

function isInsideParameter(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isParameter(p)) return true;
    if (isFunctionLike(p) || ts.isBlock(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

function fileIsClient(sf) {
  const first = sf.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use client"
  );
}

// ---------------------------------------------------------------------------
// Per-file processing
// ---------------------------------------------------------------------------

const report = {
  files: 0,
  found: 0,
  rewritten: 0,
  flagged: [],
  remaining: [],
  byNamespace: {},
};

for (const file of files) {
  const abs = join(ROOT, file);
  const source = readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(
    abs,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const ns = cfg.namespaceFor(file);
  const isClient = fileIsClient(sf);
  const fileAllowed = allowFiles.some((f) => file.includes(f));

  const edits = []; // { start, end, text }
  const hooks = new Map(); // component fn -> { tName, ns, async, existing }
  const needs = {
    hook: false,
    asyncHook: false,
    rich: false,
    moduleTranslator: false,
  };
  const flagged = [];
  const remaining = [];
  const handled = new Set(); // nodes already consumed by a run

  // Pre-scan: existing `const t = useTranslations("ns")` / getTranslations.
  function existingT(fn) {
    if (!fn.body || !ts.isBlock(fn.body)) return null;
    for (const st of fn.body.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        let init = d.initializer;
        if (init && ts.isAwaitExpression(init)) init = init.expression;
        if (
          init &&
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          (init.expression.text === "useTranslations" ||
            init.expression.text === "getTranslations") &&
          ts.isIdentifier(d.name)
        ) {
          const arg = init.arguments[0];
          const nsArg = arg && ts.isStringLiteral(arg) ? arg.text : null;
          return { tName: d.name.text, ns: nsArg ?? ns };
        }
      }
    }
    return null;
  }

  function metadataHostFor(node) {
    for (let p = node.parent; p && !ts.isSourceFile(p); p = p.parent) {
      if (metadataStatements.has(p)) return hooks.get(p);
    }
    return null;
  }

  function tFor(node, flagInfo) {
    const meta = metadataHostFor(node);
    if (meta) return meta;
    const anc = findComponentAncestor(node);
    if (
      !anc.fn &&
      cfg.moduleTranslator &&
      flagInfo.forced &&
      /^inside module-level function|^async function/.test(anc.reason ?? "")
    ) {
      needs.moduleTranslator = true;
      return { tName: null, ns, moduleFn: true };
    }
    if (!anc.fn) {
      flagged.push({
        file,
        line: lineOf(node),
        text: flagInfo.text,
        reason: anc.reason,
      });
      return null;
    }
    let h = hooks.get(anc.fn);
    if (!h) {
      const ex = existingT(anc.fn);
      const isAsync = !!anc.fn.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.AsyncKeyword,
      );
      if (isAsync && !cfg.asyncImport && cfg.moduleTranslator && flagInfo.forced) {
        needs.moduleTranslator = true;
        return { tName: null, ns, moduleFn: true };
      }
      if (isAsync && !cfg.asyncImport) {
        flagged.push({
          file,
          line: lineOf(node),
          text: flagInfo.text,
          reason: "async function",
        });
        return null;
      }
      h = ex
        ? {
            tName: ex.tName,
            ns: ex.ns,
            async: isAsync,
            existing: true,
            fn: anc.fn,
          }
        : { tName: "t", ns, async: isAsync, existing: false, fn: anc.fn };
      hooks.set(anc.fn, h);
    }
    return h;
  }

  function lineOf(node) {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  }

  function record(h, text) {
    report.found++;
    if (VERBOSE) console.error(`  ${file} ${JSON.stringify(text)}`);
    const key = keyFor(h.ns, text);
    const { file: nsFile } = splitNamespace(h.ns);
    report.byNamespace[nsFile] = (report.byNamespace[nsFile] ?? 0) + 1;
    return key;
  }

  function tCall(h, key, params, rich) {
    const nsPrefix = "";
    if (h.moduleFn) {
      const { file: nsFile, prefix } = splitNamespace(h.ns);
      const call = `${cfg.moduleTranslator.name}("${nsFile}")`;
      return params?.length
        ? `${call}("${prefix}${key}", { ${params.join(", ")} })`
        : `${call}("${prefix}${key}")`;
    }
    const fn = rich ? `${h.tName}.rich` : h.tName;
    if (params?.length) {
      return `${fn}("${nsPrefix}${key}", { ${params.join(", ")} })`;
    }
    return `${fn}("${nsPrefix}${key}")`;
  }

  // --- JSX children runs ----------------------------------------------------
  function processChildren(parent) {
    const children = parent.children;
    let i = 0;
    while (i < children.length) {
      const c = children[i];
      const startsRun =
        (ts.isJsxText(c) && c.text.trim() !== "" && /\p{L}/u.test(c.text)) ||
        false;
      if (!startsRun) {
        i++;
        continue;
      }
      // Expand left over expression/inline siblings on the same run.
      let lo = i;
      while (lo > 0 && runnable(children[lo - 1])) lo--;
      let hi = i;
      while (hi + 1 < children.length && runnable(children[hi + 1])) hi++;
      // trim run ends that are pure whitespace text or non-text expression
      // nodes contributing nothing
      while (lo < i && isWhitespaceText(children[lo])) lo++;
      while (hi > i && isWhitespaceText(children[hi])) hi--;
      const run = children.slice(lo, hi + 1);
      emitRun(parent, run);
      i = hi + 1;
    }
  }

  function isWhitespaceText(n) {
    return ts.isJsxText(n) && n.text.trim() === "";
  }

  function isStringLike(e) {
    return ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e);
  }

  // Can this child join a message run?
  function runnable(n) {
    if (ts.isJsxText(n)) return true;
    if (ts.isJsxExpression(n)) {
      const e = n.expression;
      if (!e) return false; // {/* comment */}
      if (
        ts.isJsxElement(e) ||
        ts.isJsxSelfClosingElement(e) ||
        ts.isJsxFragment(e)
      )
        return false;
      if (ts.isIdentifier(e) && e.text === "children") return false;
      if (ts.isConditionalExpression(e) || ts.isBinaryExpression(e)) {
        // `{cond ? "A" : "B"}` or `{cond && "A"}` — handled on their own as
        // string candidates; they do not fold into the surrounding message.
        return false;
      }
      if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return false;
      if (ts.isCallExpression(e) && /\.map$/.test(e.expression.getText(sf)))
        return false;
      return true;
    }
    if (ts.isJsxElement(n)) {
      // inline element with only text children (or empty) joins as a rich tag
      const kids = n.children.filter((k) => !isWhitespaceText(k));
      if (kids.length === 0) return false;
      if (
        kids.length === 1 &&
        ts.isJsxText(kids[0]) &&
        /\p{L}/u.test(kids[0].text)
      )
        return true;
      return false;
    }
    return false;
  }

  function paramName(expr, used) {
    let base = "value";
    if (ts.isIdentifier(expr)) base = expr.text;
    else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
    else if (ts.isCallExpression(expr)) {
      const callee = expr.expression;
      if (ts.isIdentifier(callee)) base = callee.text;
      else if (ts.isPropertyAccessExpression(callee)) base = callee.name.text;
    } else if (ts.isElementAccessExpression(expr)) base = "item";
    else if (ts.isTemplateExpression(expr)) base = "value";
    else if (ts.isNumericLiteral(expr)) base = "n";
    base = base.replace(/[^a-zA-Z0-9_]/g, "") || "value";
    if (/^\d/.test(base)) base = `v${base}`;
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}${n++}`;
    used.add(name);
    return name;
  }

  // The source of a param expression, with two touches: a fallback literal
  // a person would read (`place?.name ?? "this place"`) becomes t("…"),
  // and an optional chain with no fallback gets `?? ""`, because ICU
  // params refuse undefined.
  function paramExprText(e) {
    const base = e.getStart(sf);
    let text = e.getText(sf);
    const literals = [];
    const collect = (n) => {
      if (isStringLike(n)) {
        const q = n.parent;
        const fallback =
          q &&
          ((ts.isBinaryExpression(q) &&
            q.right === n &&
            [
              ts.SyntaxKind.QuestionQuestionToken,
              ts.SyntaxKind.BarBarToken,
            ].includes(q.operatorToken.kind)) ||
            (ts.isConditionalExpression(q) && q.condition !== n));
        if (fallback && !isNoiseText(n.text) && !allowTexts.has(n.text)) {
          literals.push(n);
        }
      }
      ts.forEachChild(n, collect);
    };
    collect(e);
    for (const lit of literals.sort((a, b) => b.pos - a.pos)) {
      const h = tFor(lit, { text: lit.text });
      if (!h) continue;
      const key = record(h, lit.text);
      const start = lit.getStart(sf) - base;
      const end = lit.end - base;
      text = text.slice(0, start) + tCall(h, key) + text.slice(end);
      handled.add(lit);
    }
    const topLevelFallback =
      ts.isBinaryExpression(e) &&
      [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
        e.operatorToken.kind,
      );
    if (/\?\./.test(text) && !topLevelFallback) text = `${text} ?? ""`;
    return text;
  }

  function emitRun(parent, run) {
    if (run.every((n) => ts.isJsxText(n) && n.text.trim() === "")) return;
    const first = run[0];
    const last = run[run.length - 1];
    const used = new Set();
    const params = [];
    const tags = [];
    let message = "";
    let leading = "";
    let trailing = "";
    let rich = false;
    let onlyText = true;
    const bail = null;

    run.forEach((n, idx) => {
      if (ts.isJsxText(n)) {
        const raw = n.text;
        const parts = jsxTextParts(raw);
        if (idx === 0) leading = parts.leading;
        if (idx === run.length - 1) trailing = parts.trailing;
        const inner = decodeEntities(parts.text);
        if (inner === "") {
          // whitespace between two nodes: keep a single space in the message
          // when it separates two inline parts
          if (idx > 0 && idx < run.length - 1 && /\s/.test(raw)) message += " ";
          return;
        }
        const pre = idx > 0 && parts.leading ? " " : "";
        const post = idx < run.length - 1 && parts.trailing ? " " : "";
        message += pre + inner + post;
        return;
      }
      if (ts.isJsxExpression(n)) {
        const e = n.expression;
        if (isStringLike(e)) {
          message += decodeEntities(e.text);
          return;
        }
        onlyText = false;
        const name = paramName(e, used);
        params.push(`${name}: ${paramExprText(e)}`);
        message += `{${name}}`;
        return;
      }
      if (ts.isJsxElement(n)) {
        onlyText = false;
        rich = true;
        const tagName = n.openingElement.tagName.getText(sf);
        const kids = n.children.filter((k) => !isWhitespaceText(k));
        const inner = decodeEntities(jsxTextParts(kids[0].text).text);
        let tag = tagName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "tag";
        if (tag === "link" || tag === "a") tag = "link";
        let unique = tag;
        let k = 2;
        while (used.has(unique)) unique = `${tag}${k++}`;
        used.add(unique);
        const attrs = n.openingElement.attributes.getText(sf);
        tags.push(
          `${unique}: (chunks) => <${tagName}${attrs ? ` ${attrs}` : ""}>{chunks}</${tagName}>`,
        );
        message += `<${unique}>${inner}</${unique}>`;
      }
    });

    message = message.replace(/\s+/g, " ").trim();
    if (bail) return;
    if (message === "" || !/\p{L}/u.test(message)) return;
    if (onlyText && isNoiseText(message)) return;
    if (allowTexts.has(message) || fileAllowed) return;

    const h = tFor(first, { text: message });
    if (!h) {
      remaining.push({ file, line: lineOf(first), text: message });
      return;
    }
    const key = record(h, message);
    if (rich) needs.rich = true;
    const call = tCall(h, key, [...params, ...tags], rich);
    const start = ts.isJsxText(first) ? first.pos : first.getStart(sf);
    const end = last.end;
    const replacement = `${leading ? '{" "}' : ""}{${call}}${trailing ? '{" "}' : ""}`;
    edits.push({ start, end, text: replacement });
    for (const n of run) handled.add(n);
    report.rewritten++;
  }

  // --- string literal candidates (attributes, calls, object keys) ----------
  function displayPositionOf(node) {
    // climb through conditional/binary/paren wrappers
    let n = node;
    let p = n.parent;
    while (
      p &&
      (ts.isParenthesizedExpression(p) ||
        ts.isConditionalExpression(p) ||
        (ts.isBinaryExpression(p) &&
          [
            ts.SyntaxKind.AmpersandAmpersandToken,
            ts.SyntaxKind.BarBarToken,
            ts.SyntaxKind.QuestionQuestionToken,
          ].includes(p.operatorToken.kind)) ||
        ts.isAsExpression(p) ||
        ts.isNonNullExpression(p))
    ) {
      if (ts.isConditionalExpression(p) && p.condition === n) return null;
      if (
        ts.isBinaryExpression(p) &&
        p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
        p.left === n
      )
        return null;
      n = p;
      p = p.parent;
    }
    if (!p) return null;
    if (ts.isJsxExpression(p)) {
      const gp = p.parent;
      if (ts.isJsxAttribute(gp)) {
        const name = gp.name.getText(sf);
        return TEXT_ATTRIBUTES.has(name)
          ? { kind: "attribute", attribute: name }
          : null;
      }
      if (ts.isJsxElement(gp) || ts.isJsxFragment(gp)) {
        if (handled.has(p)) return null;
        return { kind: "child" };
      }
      return null;
    }
    if (ts.isJsxAttribute(p)) {
      const name = p.name.getText(sf);
      return TEXT_ATTRIBUTES.has(name)
        ? { kind: "attribute", attribute: name }
        : null;
    }
    if (ts.isCallExpression(p) && p.arguments.includes(n)) {
      const callee = p.expression.getText(sf);
      if (TEXT_CALLS.some((re) => re.test(callee)))
        return { kind: "call", callee };
      // t("literal") is already translated; tagged string args to other
      // functions are data.
      return null;
    }
    if (
      ts.isPropertyAssignment(p) &&
      p.initializer === n &&
      ts.isIdentifier(p.name)
    ) {
      const key = p.name.text;
      if (TEXT_OBJECT_KEYS.has(key) && !NEVER_KEYS.has(key))
        return { kind: "object", key };
      return null;
    }
    // `function X({ title = "Untitled" })` — a prop default a person reads.
    if (
      (ts.isBindingElement(p) || ts.isParameter(p)) &&
      p.initializer === n &&
      isInsideParameter(p)
    ) {
      const name = ts.isIdentifier(p.name) ? p.name.text : "";
      if (
        TEXT_OBJECT_KEYS.has(name) ||
        /(label|title|text|message|description|placeholder|hint|caption)$/i.test(
          name,
        )
      ) {
        return { kind: "default", key: name };
      }
    }
    // `const title = cond ? "Paid" : "Pending"` — a value named like text,
    // assigned inside a component and rendered later.
    if (
      ts.isVariableDeclaration(p) &&
      p.initializer === n &&
      ts.isIdentifier(p.name) &&
      TEXTISH_NAME.test(p.name.text)
    ) {
      return { kind: "variable", key: p.name.text };
    }
    // `return "Paid"` inside `function statusLabel()` / `const label =
    // useMemo(() => …)`: the function (or the variable it feeds) is named
    // like text.
    if (
      (ts.isReturnStatement(p) && p.expression === n) ||
      (ts.isArrowFunction(p) && p.body === n)
    ) {
      const fn = ts.isReturnStatement(p) ? enclosingFunction(p) : p;
      const name = fn ? (nameOfFunction(fn) ?? feedsVariable(fn)) : undefined;
      if (name && TEXTISH_NAME.test(name)) return { kind: "return", key: name };
    }
    return null;
  }

  function enclosingFunction(node) {
    for (let q = node.parent; q; q = q.parent) {
      if (isFunctionLike(q)) return q;
    }
    return null;
  }

  // `const label = useMemo(() => …)` / `const title = cond ? fn() : …`:
  // the variable a function expression ultimately feeds.
  function feedsVariable(fn) {
    for (let q = fn.parent; q; q = q.parent) {
      if (ts.isVariableDeclaration(q) && ts.isIdentifier(q.name))
        return q.name.text;
      if (
        !(
          ts.isCallExpression(q) ||
          ts.isParenthesizedExpression(q) ||
          ts.isConditionalExpression(q) ||
          ts.isAsExpression(q)
        )
      )
        return undefined;
    }
    return undefined;
  }

  // `aria-label={`Remove one from ${label}`}` — a template with text and
  // expressions becomes one ICU message with named params.
  const forced = new Set(FORCE[file] ?? []);

  function templateShape(node) {
    return (
      node.head.text +
      node.templateSpans.map((span) => `{}${span.literal.text}`).join("")
    );
  }

  function processTemplate(node) {
    if (handled.has(node)) return;
    const isForced = forced.has(templateShape(node));
    const pos = displayPositionOf(node) ?? (isForced ? { kind: "forced" } : null);
    if (!pos) return;
    const used = new Set();
    const params = [];
    let message = node.head.text;
    for (const span of node.templateSpans) {
      const name = paramName(span.expression, used);
      params.push(`${name}: ${paramExprText(span.expression)}`);
      message += `{${name}}${span.literal.text}`;
    }
    if (!/\p{L}{2,}/u.test(message.replace(/\{[^}]*\}/g, ""))) return;
    if (!isForced && isNoiseText(message.replace(/\{[^}]*\}/g, "x"))) return;
    if (allowTexts.has(message) || fileAllowed) return;
    const h = tFor(node, { text: message, forced: isForced });
    if (!h) {
      remaining.push({ file, line: lineOf(node), text: message });
      return;
    }
    const key = record(h, message);
    const replacement = tCall(h, key, params);
    edits.push({ start: node.getStart(sf), end: node.end, text: replacement });
    handled.add(node);
    report.rewritten++;
  }

  function processString(node) {
    if (handled.has(node) || handled.has(node.parent)) return;
    const isForced = forced.has(node.text);
    const pos = displayPositionOf(node) ?? (isForced ? { kind: "forced" } : null);
    if (!pos) return;
    const text = node.text;
    if (!isForced && isNoiseText(text, { attribute: pos.attribute })) return;
    if (allowTexts.has(text) || fileAllowed) return;
    // Values that are really code: variants, keys, ids, enum props such as
    // next/image's placeholder="blur" or loading="lazy".
    // A lowercase single token is a code ("completed", "blur"), not text.
    if (!isForced && pos.kind !== "child" && /^[a-z0-9_-]+$/.test(text))
      return;
    const h = tFor(node, { text, forced: isForced });
    if (!h) {
      if (
        MODULE_KEYS_PATH &&
        isForced &&
        findComponentAncestor(node).reason === "module scope"
      ) {
        const key = record({ ns }, text);
        let owner = null;
        for (let q = node.parent; q && !ts.isSourceFile(q); q = q.parent) {
          if (ts.isVariableDeclaration(q) && ts.isIdentifier(q.name)) {
            owner = q.name.text;
            break;
          }
        }
        edits.push({
          start: node.getStart(sf),
          end: node.end,
          text: JSON.stringify(key),
        });
        moduleKeys.push({ file, line: lineOf(node), owner, key, ns, text });
        handled.add(node);
        report.rewritten++;
        return;
      }
      remaining.push({ file, line: lineOf(node), text });
      return;
    }
    const key = record(h, text);
    let replacement = tCall(h, key);
    // placeholder="x" -> placeholder={t("x")}
    if (ts.isJsxAttribute(node.parent)) replacement = `{${replacement}}`;
    edits.push({ start: node.getStart(sf), end: node.end, text: replacement });
    handled.add(node);
    report.rewritten++;
  }

  // --- `export const metadata = { title: "…" }` → generateMetadata() ------
  // Static metadata cannot be translated; a page with text in it becomes an
  // async generateMetadata() that reads the catalog for the request's
  // language. Only the web target has a server-side translator.
  const metadataStatements = new Set();
  if (cfg.asyncImport) {
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      const decl = st.declarationList.declarations[0];
      if (!decl || !ts.isIdentifier(decl.name) || decl.name.text !== "metadata")
        continue;
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer))
        continue;
      const hasText = !!decl.initializer.properties.find(
        (p) =>
          ts.isPropertyAssignment(p) &&
          ts.isIdentifier(p.name) &&
          TEXT_OBJECT_KEYS.has(p.name.text) &&
          isStringLike(p.initializer) &&
          !isNoiseText(p.initializer.text),
      );
      if (!hasText) continue;
      metadataStatements.add(st);
      const objText = decl.initializer.getText(sf);
      const typeText = decl.type ? decl.type.getText(sf) : "Metadata";
      // Register a synthetic host so string candidates inside resolve to it.
      const synthetic = {
        kind: "metadata",
        statement: st,
        objStart: decl.initializer.getStart(sf),
        objEnd: decl.initializer.end,
        objText,
        typeText,
      };
      hooks.set(st, {
        tName: "t",
        ns,
        async: true,
        existing: false,
        fn: null,
        synthetic,
      });
    }
  }

  // --- walk -----------------------------------------------------------------
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) processChildren(node);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      processString(node);
    if (ts.isTemplateExpression(node)) processTemplate(node);
    ts.forEachChild(node, visit);
  }
  visit(sf);

  report.files++;
  report.flagged.push(...flagged);
  report.remaining.push(...remaining);

  if (!APPLY || edits.length === 0) continue;

  // --- hook insertions -------------------------------------------------------
  const importNeeded = { sync: false, async: false };
  for (const [fn, h] of hooks) {
    if (h.existing) continue;
    if (h.synthetic) {
      // Replace `export const metadata: Metadata = {…}` with a function that
      // returns the same object, now built from the catalog. The object's
      // own string edits are already queued against the original text
      // positions, so only the statement's head and tail change.
      const st = h.synthetic.statement;
      const head = `export async function generateMetadata(): Promise<${h.synthetic.typeText}> {\n  const ${h.tName} = await ${cfg.asyncImport.name}("${h.ns}");\n  return `;
      edits.push({
        start: st.getStart(sf),
        end: h.synthetic.objStart,
        text: head,
      });
      edits.push({ start: h.synthetic.objEnd, end: st.end, text: ";\n}" });
      importNeeded.async = true;
      continue;
    }
    const call = h.async
      ? `const ${h.tName} = await ${cfg.asyncImport.name}("${h.ns}");`
      : `const ${h.tName} = ${cfg.hookImport.name}("${h.ns}");`;
    if (h.async) importNeeded.async = true;
    else importNeeded.sync = true;
    const body = fn.body;
    if (body && ts.isBlock(body)) {
      edits.push({
        start: body.getStart(sf) + 1,
        end: body.getStart(sf) + 1,
        text: `\n  ${call}\n`,
      });
    } else if (body) {
      // arrow with expression body: () => (<div/>)  ->  () => { const t…; return (<div/>); }
      edits.push({
        start: body.getStart(sf),
        end: body.getStart(sf),
        text: `{ ${call} return `,
      });
      edits.push({ start: body.end, end: body.end, text: "; }" });
    }
  }

  // --- imports ---------------------------------------------------------------
  function ensureImport(name, from) {
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
        const lastEl = nb.elements[nb.elements.length - 1];
        edits.push({ start: lastEl.end, end: lastEl.end, text: `, ${name}` });
        return;
      }
    }
    const lastImport = [...sf.statements]
      .reverse()
      .find((s) => ts.isImportDeclaration(s));
    let at = 0;
    if (lastImport) at = lastImport.end;
    else if (isClient) at = sf.statements[0].end;
    edits.push({
      start: at,
      end: at,
      text: `\nimport { ${name} } from "${from}";`,
    });
  }
  if (importNeeded.sync) {
    const from =
      target === "mobile" && file.startsWith("packages/ui-native/")
        ? relative(dirname(abs), join(ROOT, "packages/ui-native/src/i18n"))
            .split(sep)
            .join("/")
            .replace(/^(?!\.)/, "./")
        : cfg.hookImport.from;
    ensureImport(cfg.hookImport.name, from);
  }
  if (importNeeded.async)
    ensureImport(cfg.asyncImport.name, cfg.asyncImport.from);
  if (needs.moduleTranslator) {
    const from =
      target === "mobile" && file.startsWith("packages/ui-native/")
        ? relative(dirname(abs), join(ROOT, "packages/ui-native/src/i18n"))
            .split(sep)
            .join("/")
            .replace(/^(?!\.)/, "./")
        : cfg.moduleTranslator.from;
    ensureImport(cfg.moduleTranslator.name, from);
  }

  // --- apply edits (from the end) --------------------------------------------
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let out = source;
  let lastStart = Number.POSITIVE_INFINITY;
  for (const e of edits) {
    if (e.end > lastStart) {
      // overlapping edit — should not happen; keep the outer one
      continue;
    }
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  writeFileSync(abs, out);
}

// ---------------------------------------------------------------------------
// Catalog output
// ---------------------------------------------------------------------------

if (APPLY) {
  for (const [nsFile, r] of catalogs) {
    if (r.added.size === 0) continue;
    const en = readCatalog("en", nsFile);
    for (const [key, text] of r.added) setPath(en, key, text);
    writeCatalog("en", nsFile, en);
    for (const locale of LOCALES) {
      if (locale === "en") continue;
      const cat = readCatalog(locale, nsFile);
      const flat = flatten(cat);
      for (const [key, text] of r.added) {
        // Untranslated until the translation pass fills it in: an English
        // fallback is better than a raw key on screen.
        if (!(key in flat)) setPath(cat, key, text);
      }
      writeCatalog(locale, nsFile, cat);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const lines = [];
lines.push(`# i18n extraction report — ${target}`);
lines.push("");
lines.push(`Files scanned: ${report.files}`);
lines.push(`Strings found: ${report.found}`);
lines.push(`Rewritten${APPLY ? "" : " (would be)"}: ${report.rewritten}`);
lines.push(`Needing a hand edit: ${report.flagged.length}`);
lines.push("");
lines.push("## By namespace");
for (const [ns, n] of Object.entries(report.byNamespace).sort())
  lines.push(`- ${ns}: ${n}`);
lines.push("");
lines.push("## Hand edits");
const byReason = {};
for (const f of report.flagged) {
  if (!byReason[f.reason]) byReason[f.reason] = [];
  byReason[f.reason].push(f);
}
for (const [reason, items] of Object.entries(byReason)) {
  lines.push(`### ${reason} (${items.length})`);
  for (const it of items)
    lines.push(`- ${it.file}:${it.line} — ${JSON.stringify(it.text)}`);
  lines.push("");
}

const text = lines.join("\n");
if (REPORT_PATH) writeFileSync(REPORT_PATH, text);
if (MODULE_KEYS_PATH) {
  writeFileSync(
    resolve(MODULE_KEYS_PATH),
    `${JSON.stringify(moduleKeys, null, 2)}\n`,
  );
}
else console.log(text);

if (CHECK) {
  const left = report.remaining.length + report.rewritten;
  if (left > 0) {
    console.error(
      `\ni18n: ${left} hardcoded strings remain in ${target}. Run the extractor or add deliberate exceptions to scripts/i18n/allowlist.json.`,
    );
    for (const r of [...report.remaining].slice(0, 50))
      console.error(`  ${r.file}:${r.line} ${JSON.stringify(r.text)}`);
    process.exit(1);
  }
}
