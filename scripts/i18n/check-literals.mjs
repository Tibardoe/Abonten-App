#!/usr/bin/env node
// A second net under extract-strings.mjs. That script knows the places a
// person-facing string usually sits (JSX text, label/title props, toasts).
// This one asks the opposite question: does ANY string literal in the app
// read like words for a person and yet never pass through a translator?
// It catches what the first net cannot know about — a helper that returns
// "Refund pending", a `kicker = event.category ?? "Event"`, an array of
// "10 minutes before" choices, a comparison against an English label.
//
//   node scripts/i18n/check-literals.mjs --target mobile          # report
//   node scripts/i18n/check-literals.mjs --target web --check     # CI
//
// A string is reported when it looks like prose (two words, or one
// Capitalised word used as a value) and is not: an argument of a
// translator / logger / Error / class-name helper, a class list, a path, a
// column list, an identifier, a type, an import, or a JSX prop that never
// holds words. Anything that must stay (a brand name, a font, sample text
// in a dev-only screen) goes in scripts/i18n/literal-allowlist.json with
// the reason it is not translated.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOWLIST_PATH = join(ROOT, "scripts/i18n/literal-allowlist.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const target = option("target") ?? "web";
const CHECK = flag("check");
const ONLY = option("only");
const JSON_OUT = option("json");

const TARGETS = {
  web: {
    roots: ["apps/web/src"],
    exclude: [
      "apps/web/src/app/api/",
      "apps/web/src/actions/",
      "apps/web/src/i18n/",
      "apps/web/src/content/",
      "apps/web/src/config/",
      "apps/web/src/components/ui/",
      "apps/web/src/instrumentation",
      "apps/web/src/sentry.",
      "apps/web/src/proxy.ts",
      "apps/web/src/app/global-error.tsx",
      "apps/web/src/app/fonts.ts",
      "/e2e/",
      ".test.",
      ".d.ts",
    ],
  },
  mobile: {
    roots: ["apps/mobile/app", "apps/mobile/src", "packages/ui-native/src"],
    exclude: [
      ".test.",
      ".d.ts",
      "packages/ui-native/src/i18n/",
      "packages/ui-native/src/primitives/brandPaths.ts",
      "packages/ui-native/src/theme/",
      "+native-intent",
    ],
  },
  // The shared copy and rules. Its words go through a CoreTranslator; the
  // admin console's own labels (admin/) are English by design.
  core: {
    roots: ["packages/core/src"],
    exclude: [
      ".test.",
      ".d.ts",
      "packages/core/src/admin/",
      "packages/core/src/i18n/",
      "packages/core/src/logger",
      "packages/core/src/notifications/storedNotices.ts",
      // Staff tools (the admin console is English): permissions, market
      // readiness and transitions, reward risk signals, the search
      // vocabulary and Weekly editors, per-country address forms.
      "packages/core/src/adminPermissions.ts",
      "packages/core/src/market/readiness.ts",
      "packages/core/src/market/transitions.ts",
      "packages/core/src/rewards/riskScore.ts",
      "packages/core/src/search/searchVocabulary.ts",
      "packages/core/src/weekly/sectionKinds.ts",
      "packages/core/src/geo/addressSchema.ts",
      "packages/core/src/geo/countryDefaults.ts",
      "packages/core/src/fieldOps/territory.ts",
      // Data and names, not sentences: category values (worded through
      // categoryLabels), networks, currency symbols, the brand.
      "packages/core/src/eventCategoriesAndTypes.ts",
      "packages/core/src/networkProviderData.ts",
      "packages/core/src/money/currencies.ts",
      "packages/core/src/brand/",
      // Country names from CLDR (scripts/gen-country-data.mjs), in English
      // and in each language the app speaks.
      "packages/core/src/geo/countryData.ts",
      "packages/core/src/geo/countryNames.generated.ts",
      // English calendar words kept for runtimes without Intl data.
      "packages/core/src/dateFormatter.ts",
      // Messages of errors thrown for logs and callers' catch blocks.
      "packages/core/src/env/",
      "packages/core/src/http/",
      "packages/core/src/money/money.ts",
    ],
  },
  // The packages every app shares that have no translator of their own:
  // a label map or a validation message here reaches every reader in
  // English. They must hold codes and keys, never words.
  shared: {
    roots: [
      "packages/types/src",
      "packages/validation/src",
      "packages/api-client/src",
    ],
    exclude: [
      ".test.",
      ".d.ts",
      "database.types.ts",
      // The admin console's English label maps; the apps word reports
      // through @abonten/core/reportCopy.
      "packages/types/src/adminTypes.ts",
      // A schema's sentences are English keys of the `validation` catalog
      // (extract-validation-messages.mjs reads them with --with-validation
      // and checks none is missing).
      ...(flag("with-validation") ? [] : ["packages/validation/src/"]),
    ],
  },
  // Code that answers requests. Its words for people go through tr() /
  // coreT() / the notice registry; what is left in English must be
  // something no person reads (a log line, an audit note, a reason stored
  // for staff, a provider-facing description).
  server: {
    roots: [
      "packages/services/src",
      "apps/web/src/actions",
      "apps/web/src/app/api",
      "apps/web/src/utils",
      "apps/web/src/lib",
    ],
    // Under these roots only modules that run on the server belong here.
    serverModulesOnlyUnder: ["apps/web/src/utils", "apps/web/src/lib"],
    exclude: [
      "__integration__",
      ".test.",
      ".d.ts",
      "packages/services/src/i18n/",
      // The admin console is English (staff tool); so are its services.
      "packages/services/src/admin/",
      "apps/web/src/app/api/observability/",
      "apps/web/src/app/api/jobs/",
      "apps/web/src/app/api/maintenance/",
      "apps/web/src/app/api/monitoring/",
    ],
    // Values that are stored or sent for staff, logs and providers.
    nonTextNames: [
      "failure_reason",
      "failureReason",
      "p_reason",
      "p_note",
      "p_detail",
      "p_summary",
      "p_memo",
      "p_description",
      "p_label",
      "note",
      "memo",
      "summary",
      "detail",
      "details",
      "reference",
      "operation",
      "step",
      "stage",
      "source",
      "context",
      "cause",
      "hint",
      "outcome",
      "result",
      "level",
      "metric",
      "label",
      "subject_type",
      "resource_type",
      "entity",
    ],
    safeCalls: [
      // Thrown for the caller's catch block or the log, never shown as is.
      /^(new)?\w*(Error|Exception)$/,
      /^super$/,
      /^(fail|unsupported|invariant|assertNever|warnOnce)$/,
      /^(recordAdminAudit|recordAudit|audit\w*)$/,
      /^(Sentry|logger)\.\w+$/,
      /\.(startSpan|setTag|setContext|addBreadcrumb)$/,
    ],
  },
};

const cfg = TARGETS[target];
if (!cfg) {
  console.error(`Unknown target ${target}`);
  process.exit(2);
}

// Modules that only run on the server word their messages through tr()
// (scripts/i18n/extract-server-messages.mjs checks those).
const SERVER_ONLY_IMPORT =
  /from "(server-only|next\/headers|next\/server|@\/config\/supabase\/(server|serviceClient)|@abonten\/services\/[^"]+|node:[a-z_/]+|resend|@react-pdf\/renderer)"|^import "server-only";|^"use server";/m;

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

const files = cfg.roots
  .flatMap((r) => walk(join(ROOT, r), []))
  .map((f) => relative(ROOT, f).split(sep).join("/"))
  .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
  .filter((f) => !cfg.exclude.some((x) => f.includes(x)))
  .filter((f) => !ONLY || f.includes(ONLY))
  .sort();

const IS_SERVER = target === "server";

const allowlist = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  : { texts: [], files: [], entries: [] };
const allowTexts = new Set(allowlist.texts ?? []);
const allowFiles = allowlist.files ?? [];
const allowEntries = new Set(
  (allowlist.entries ?? []).map((e) => `${e.file}::${e.text}`),
);

// ── what reads like prose ────────────────────────────────────────────

// Two words, the second possibly opening a bracket or a quote:
// "Website (optional)" reached readers in English because the bracket hid
// the second word.
const TWO_WORDS = /[A-Za-zÀ-ÿ]{2,}[’']?[a-z]*\s+[(\[“"'«]?[A-Za-zÀ-ÿ]+/;
const ONE_CAPITALISED = /^[A-Z][a-z]{2,}[.!?…]?$/;

function looksLikeClassList(text) {
  const tokens = text.trim().split(/\s+/);
  if (tokens.length === 0) return false;
  return (
    tokens.every((t) => /^[!a-z0-9:\-[\]/.%#()_,&>*+=@']+$/.test(t)) &&
    tokens.some((t) =>
      /[-:[\]/]|^(flex|grid|block|hidden|absolute|relative|fixed|sticky|uppercase|lowercase|capitalize|truncate|italic|underline|grow|shrink|group|peer|container|static|inline|contents|invisible|visible|rounded|border|shadow|transition|transform|outline|ring|sr-only)$/.test(
        t,
      ),
    )
  );
}

function looksLikeCode(text) {
  const t = text.trim();
  if (t.startsWith("<")) return true; // markup: its words are handled inside
  if (/^(Bearer|Basic|Token)( |$)/.test(t)) return true; // an Authorization header
  if (/<[^<>\s]+@[^<>\s]+>$/.test(t)) return true; // "Name <mailbox@host>"
  if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#|@\/|~\/|data:)/.test(t))
    return true;
  // one token: code unless it is a plain Capitalised word ("Free", "Closed")
  if (
    /^[a-z0-9_.\-:/\[\]*]+$/i.test(t) &&
    !/\s/.test(t) &&
    !/^[A-Z][a-z]{2,}$/.test(t)
  )
    return true;
  // column lists, selectors, formats
  if (/^[a-z0-9_*.,:()\s!>\-"]+$/.test(t) && /[,_()]/.test(t)) return true;
  if (/^[YMDHhmsaAEdyz\s:./,\-']+$/.test(t)) return true; // date format
  if (/^(rgba?|hsla?|var|calc|translate|scale|rotate|cubic-bezier)\(/.test(t))
    return true;
  if (/^\d+(px|rem|em|%|ms|s|vh|vw)(\s+\d+(px|rem|em|%|ms|s|vh|vw))*$/.test(t))
    return true;
  return false;
}

// Words that sit beside a `${value}` without being English prose.
const TEMPLATE_NOISE = new Set([
  "bearer",
  "basic",
  "auto",
  "none",
  "solid",
  "center",
  "translate",
  "rotate",
  "scale",
  "calc",
  "var",
  "rgb",
  "rgba",
  "hsl",
  "minmax",
  "repeat",
  "deg",
  "turn",
  "eq",
  "ilike",
  "asc",
  "desc",
  "utf",
  "true",
  "false",
  "null",
]);

/**
 * `${count} upcoming`, `${n} date${s}`, `review${s}`: a template that puts
 * a value next to one lowercase English word. The two-word test misses
 * these, and they are the ones that read worst in another language.
 */
function gluesAWord(text) {
  if (!/\{[^}]*\}/.test(text)) return false;
  // only letters, digits, spaces and light punctuation: not a path, a URL,
  // a selector, a class list or a format string
  if (/[/\\:=_<>@#$%&*;[\]|~^`"]/.test(text.replace(/\{[^}]*\}/g, ""))) {
    return false;
  }
  // `row-${id}`, `url(${src})`, `prefs.${userId}`: an identifier, not words
  if (/[A-Za-z0-9][-.(]\{|\}[-.(][A-Za-z0-9]/.test(text) && !/\s/.test(text)) {
    return false;
  }
  const words = text
    .replace(/\{[^}]*\}/g, " \u0000 ")
    .split(/[\s,.()·–—+!?'’-]+/)
    .filter(Boolean);
  if (!words.includes("\u0000")) return false;
  return words.some(
    (w) => /^[a-z]{3,}$/.test(w) && !TEMPLATE_NOISE.has(w) && w !== "\u0000",
  );
}

function isProse(text, singleOk) {
  const t = text.replace(/\{[^}]*\}/g, " ").trim();
  if (!t) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(t)) return false;
  if (!singleOk && gluesAWord(text)) return true;
  // `You: ${preview}` — one Capitalised word beside a value
  if (
    !singleOk &&
    /\{[^}]*\}/.test(text) &&
    /^[A-Z][a-z]{2,}$/.test(t.replace(/[.,:;!?…]+$/, "")) &&
    !/^(Bearer|Basic|Token)$/.test(t)
  ) {
    return true;
  }
  if (looksLikeClassList(t) || looksLikeCode(t)) return false;
  if (TWO_WORDS.test(t)) {
    // all-lowercase-with-symbols technical strings ("use client", "no-store")
    if (/^[a-z0-9\s\-_:;=,.()/'"]+$/.test(t) && !/[.!?…]$/.test(t)) {
      // lowercase phrases are prose only when they contain a common word
      return /\b(the|your|you|to|of|and|is|are|for|in|on|or|a|an|this|that|with|from|not|no|yes|we|it|by|at|be|as|near|here)\b/.test(
        t,
      );
    }
    return true;
  }
  return singleOk && ONE_CAPITALISED.test(t);
}

// ── where a string is never words ────────────────────────────────────

const SAFE_CALLS = [
  /^t[A-Z]?\w*$/, // t, tc, tAuth, tCommon…
  /^(i18n\.)?t$/,
  /^words\.(t|core)$/,
  /^(core|tr|trFor|coreT)$/,
  /^(useTranslations|getTranslations|useFormatter|getFormatter)$/,
  /^(logger|console|Sentry|log)\.\w+$/,
  /^(Error|TypeError|RangeError|invariant|assert)$/,
  /^(cn|clsx|twMerge|cva|tv|classNames)$/,
  /^(require|fetch|encodeURIComponent|decodeURIComponent|Symbol|RegExp|Number|String|Boolean|BigInt|parseInt|parseFloat)$/,
  /\.(push|replace|navigate|prefetch|back|setParams|canGoBack|dismissTo)$/, // routers (checked below for .push on arrays)
  /\.(from|select|rpc|eq|neq|in|is|not|or|and|order|filter|match|gt|gte|lt|lte|like|ilike|contains|overlaps|channel|on|schema|storage|textSearch|range|limit|single|maybeSingle|update|insert|upsert|delete)$/,
  /\.(includes|startsWith|endsWith|indexOf|lastIndexOf|split|join|replace|replaceAll|match|matchAll|test|localeCompare|padStart|padEnd|get|set|has|append|delete|getItem|setItem|removeItem|getItemAsync|setItemAsync|deleteItemAsync|addEventListener|removeEventListener|querySelector|querySelectorAll|getElementById|setAttribute|getAttribute|createElement|charAt|at|slice|trim|toFixed|toLocaleString|toLocaleDateString|toLocaleTimeString|format|formatToParts)$/,
  /^(new\s+)?(Intl\.\w+|Date|URL|URLSearchParams|Headers|Request|Response|Blob|File|Map|Set|Audio|Image|Worker|BroadcastChannel|CustomEvent|Event|AbortController|TextEncoder|TextDecoder)$/,
  /^(describe|it|test|expect|vi|jest)(\.\w+)*$/,
  /^(track|report|capture|record|log|mark|measure)[A-Z]\w*$/,
  /^(reportError|reportClientError|captureException|captureMessage|captureAdminActionError)$/,
  /^(z|v)\.\w+$/,
  /^(useQuery|useMutation|useInfiniteQuery|useQueryClient|invalidateQueries|setQueryData|getQueryData)$/,
  /^(Platform\.select|StyleSheet\.create|Linking\.\w+|Haptics\.\w+|SecureStore\.\w+|Notifications\.\w+|FileSystem\.\w+|Sharing\.\w+|Updates\.\w+)$/,
  /^(buildCloudinaryUrl|generateSlug|undoSlug|cloudinaryUrl|usePathname|useSearchParams|redirect|permanentRedirect|notFound|revalidatePath|revalidateTag|revalidateAppPath|dynamic|lazy|createContext|forwardRef|memo)$/,
];

// Names of props, object keys and variables that never hold words. A name
// matches when it IS one of these or ends with one in camelCase
// (`containerClassName`, `eventId`): "paid" must not match "id".
const NON_TEXT_WORDS = [
  "class",
  "className",
  "style",
  "id",
  "key",
  "type",
  "kind",
  "variant",
  "size",
  "tone",
  "role",
  "testID",
  "icon",
  "mode",
  "rel",
  "target",
  "method",
  "href",
  "src",
  "url",
  "uri",
  "path",
  "route",
  "slug",
  "code",
  "status",
  "state",
  "event",
  "action",
  "field",
  "column",
  "table",
  "query",
  "param",
  "header",
  "locale",
  "currency",
  "format",
  "align",
  "justify",
  "direction",
  "color",
  "fill",
  "stroke",
  "viewBox",
  "points",
  "transform",
  "width",
  "height",
  "keyboardType",
  "autoComplete",
  "autoCapitalize",
  "inputMode",
  "returnKeyType",
  "textContentType",
  "resizeMode",
  "contentFit",
  "pointerEvents",
  "behavior",
  "presentation",
  "animation",
  "edges",
  "namespace",
  "ns",
  "tag",
  "scope",
  "provider",
  "platform",
  "channel",
  "bucket",
  "folder",
  "ext",
  "mime",
  "accept",
  "encoding",
  "charset",
  "lang",
  "dir",
  "as",
  "htmlFor",
  "sizes",
  "loading",
  "decoding",
  "priority",
  "fetchPriority",
  "crossOrigin",
  "referrerPolicy",
  "sandbox",
  "allow",
  "enterKeyHint",
  "easing",
  "origin",
  "position",
  "display",
  "overflow",
  "cursor",
  "visibility",
  "opacity",
  "zIndex",
  "gap",
  "top",
  "left",
  "right",
  "bottom",
  "inset",
  "objectFit",
  "whiteSpace",
  "wordBreak",
  "lineHeight",
  "letterSpacing",
  "fontFamily",
  "fontWeight",
  "fontStyle",
  "fontSize",
  "textAlign",
  "textTransform",
  "textDecorationLine",
  "flexDirection",
  "flexWrap",
  "alignItems",
  "alignSelf",
  "justifyContent",
  "backgroundColor",
  "borderColor",
  "borderStyle",
  "shadowColor",
  "d",
  "x",
  "y",
  "displayName",
  "@type",
  "@context",
  "@id",
  "screen",
  "pathname",
  "name",
  "family",
  "weight",
];
const NON_TEXT_EXACT = new Set([
  ...NON_TEXT_WORDS,
  ...(cfg.nonTextNames ?? []),
]);
const NON_TEXT_SUFFIX = NON_TEXT_WORDS.filter((w) => w.length > 2).map(
  (w) => w.charAt(0).toUpperCase() + w.slice(1),
);
const NON_TEXT_NAME = {
  test(name) {
    if (NON_TEXT_EXACT.has(name)) return true;
    return NON_TEXT_SUFFIX.some((suffix) => name.endsWith(suffix));
  },
};

function calleeText(node, sf) {
  if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
    const text = node.expression.getText(sf);
    return ts.isNewExpression(node) ? text : text;
  }
  return "";
}

function isSafeCall(node, sf) {
  let cur = node.parent;
  let child = node;
  // climb through wrappers that keep the literal an argument
  while (
    cur &&
    (ts.isParenthesizedExpression(cur) ||
      ts.isAsExpression(cur) ||
      ts.isNonNullExpression(cur) ||
      ts.isSatisfiesExpression?.(cur) ||
      ts.isTemplateSpan(cur) ||
      ts.isTemplateExpression(cur) ||
      ts.isConditionalExpression(cur) ||
      (ts.isBinaryExpression(cur) &&
        [
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.PlusToken,
        ].includes(cur.operatorToken.kind)) ||
      ts.isArrayLiteralExpression(cur) ||
      ts.isObjectLiteralExpression(cur) ||
      ts.isPropertyAssignment(cur) ||
      ts.isSpreadElement(cur))
  ) {
    child = cur;
    cur = cur.parent;
  }
  if (cur && (ts.isCallExpression(cur) || ts.isNewExpression(cur))) {
    if (cur.expression === child) return false;
    const text = calleeText(cur, sf).replace(/\s+/g, "");
    // router.push({ pathname, params: { title: "Your order" } }): the path
    // is not words, but a phrase handed to the next screen is.
    if (
      /\.(push|replace|navigate|setParams|dismissTo)$/.test(text) &&
      !ts.isCallExpression(node.parent) &&
      isPhrase(node)
    ) {
      return false;
    }
    // array.push("words") is not a router push
    if (
      /\.push$/.test(text) &&
      !/(router|navigation|nav|history)\.push$/.test(text)
    ) {
      return false;
    }
    return (
      SAFE_CALLS.some((re) => re.test(text)) ||
      (cfg.safeCalls ?? []).some((re) => re.test(text))
    );
  }
  if (cur && ts.isTaggedTemplateExpression(cur)) return true;
  if (cur && ts.isThrowStatement(cur)) return true;
  return false;
}

// A full sentence is words whatever the prop or key that holds it is called
// (`invalidUrl: "Enter a valid website URL."`).
function isSentence(node) {
  const text = (node.text ?? "").trim();
  return /[.!?…]$/.test(text) && text.split(/\s+/).length >= 3;
}

// So is a phrase that opens with a Capitalised word and goes on with more
// words or a value: `const kind = deleted ? "Deleted message" : "Photo"`,
// `mode: "Single Ticket Type"`, `successCtaLabel: \`View ${kind}\``. A name
// such as `kind`, `mode` or `type` excuses a code ("mobile_money", "Free"),
// never a phrase — these reached readers in English because the name did.
function isPhrase(node) {
  const raw = literalText(node) ?? "";
  const hasValue = raw.includes("{}");
  const text = raw.replace(/\{\}/g, " ").trim();
  if (!/^[A-Z][a-z]+/.test(text)) return false;
  if (/^[A-Z][a-z]+$/.test(text)) return hasValue;
  if (!/^[A-Za-zÀ-ÿ’'.,!?…:–—\-\s]+$/.test(text)) return false;
  return /\s[A-Za-zÀ-ÿ]/.test(text);
}

function inNonTextPosition(node, sf) {
  const p = node.parent;
  if (!p) return true;
  // `author.name ?? "Someone"`: a Capitalised word standing in for a missing
  // name is shown to a reader, whatever the variable is called.
  const isFallbackWord =
    ts.isBinaryExpression(p) &&
    p.right === node &&
    [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
      p.operatorToken.kind,
    ) &&
    ONE_CAPITALISED.test((node.text ?? "").trim());
  const nameExcuses =
    !isSentence(node) && !isPhrase(node) && !isFallbackWord;
  // imports, exports, types, directives
  for (let cur = p; cur; cur = cur.parent) {
    if (
      ts.isImportDeclaration(cur) ||
      ts.isExportDeclaration(cur) ||
      ts.isImportTypeNode?.(cur) ||
      ts.isTypeNode(cur) ||
      ts.isTypeAliasDeclaration(cur) ||
      ts.isInterfaceDeclaration(cur) ||
      ts.isEnumDeclaration(cur) ||
      ts.isModuleDeclaration(cur)
    ) {
      return true;
    }
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) break;
  }
  if (ts.isExpressionStatement(p)) return true; // "use client"
  if (ts.isPropertyAssignment(p) && p.name === node) return true; // a key
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node)
    return true;
  if (ts.isCaseClause(p)) return true;
  if (
    ts.isBinaryExpression(p) &&
    p.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    p.right === node &&
    ts.isPropertyAccessExpression(p.left) &&
    NON_TEXT_NAME.test(p.left.name.text)
  ) {
    return true;
  }
  if (
    ts.isBinaryExpression(p) &&
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.InKeyword,
    ].includes(p.operatorToken.kind)
  ) {
    // comparing against prose is itself a bug worth seeing; identifiers are not prose
    return !TWO_WORDS.test(node.text ?? "");
  }
  // JSX attribute that never holds words
  let attr = p;
  if (ts.isJsxExpression(attr)) attr = attr.parent;
  if (attr && ts.isJsxAttribute(attr)) {
    const name = attr.name.getText(sf);
    if (name.startsWith("data-") || name.startsWith("aria-hidden")) return true;
    if (nameExcuses && NON_TEXT_NAME.test(name)) return true;
  }
  // property / variable whose name says it is not words
  let holder = p;
  while (
    holder &&
    (ts.isConditionalExpression(holder) ||
      ts.isParenthesizedExpression(holder) ||
      ts.isAsExpression(holder) ||
      ts.isArrayLiteralExpression(holder) ||
      (ts.isBinaryExpression(holder) &&
        [
          ts.SyntaxKind.QuestionQuestionToken,
          ts.SyntaxKind.BarBarToken,
        ].includes(holder.operatorToken.kind)))
  ) {
    holder = holder.parent;
  }
  if (holder && ts.isPropertyAssignment(holder)) {
    const name = holder.name.getText(sf).replace(/["']/g, "");
    if (nameExcuses && NON_TEXT_NAME.test(name)) return true;
  }
  if (
    holder &&
    ts.isVariableDeclaration(holder) &&
    ts.isIdentifier(holder.name)
  ) {
    const name = holder.name.text;
    if (
      /^[A-Z0-9_]+$/.test(name) &&
      /(KEY|ID|PATH|URL|ROUTE|TAG|NAME|PREFIX|SUFFIX|CHANNEL|EVENT|QUERY|TABLE|BUCKET|COOKIE|HEADER|REGEX|FORMAT|FONT|CLASS|STYLE|COLOR|TYPE|KIND|STATUS|CODE|VALUE|SLUG|SCHEME)S?$/.test(
        name,
      )
    ) {
      return true;
    }
    if (nameExcuses && NON_TEXT_NAME.test(name)) return true;
  }
  return false;
}

function literalText(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans.map((s) => `{}${s.literal.text}`).join("")
    );
  }
  return null;
}

const findings = [];

for (const file of files) {
  if (allowFiles.some((f) => file.includes(f))) continue;
  const abs = join(ROOT, file);
  const source = readFileSync(abs, "utf8");
  if (IS_SERVER) {
    // Browser-side helpers that sit beside server modules are the web
    // target's; .tsx is React (the web target's too).
    if (file.endsWith(".tsx")) continue;
    if (
      cfg.serverModulesOnlyUnder.some((r) => file.startsWith(r)) &&
      !SERVER_ONLY_IMPORT.test(source)
    ) {
      continue;
    }
  } else if (file.endsWith(".ts") && SERVER_ONLY_IMPORT.test(source)) {
    continue;
  }
  const sf = ts.createSourceFile(
    abs,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const visit = (node) => {
    // a template inside a template span is visited through its parent
    const text = literalText(node);
    if (text !== null) {
      const single =
        ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
      if (
        isProse(text, single) &&
        !inNonTextPosition(node, sf) &&
        !isSafeCall(node, sf) &&
        !allowTexts.has(text) &&
        !allowEntries.has(`${file}::${text}`)
      ) {
        const line =
          sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        findings.push({ file, line, text });
      }
    }
    if (ts.isJsxText(node)) return; // extract-strings.mjs owns JSX text
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (JSON_OUT) {
  const out = {};
  for (const f of findings) {
    out[f.file] ??= [];
    if (!out[f.file].includes(f.text)) out[f.file].push(f.text);
  }
  writeFileSync(resolve(JSON_OUT), `${JSON.stringify(out, null, 2)}\n`);
}

if (findings.length === 0) {
  console.log(`literals (${target}): none outside the catalogs.`);
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
  for (const f of list) console.log(`  ${f.line}: ${JSON.stringify(f.text)}`);
}
console.log(
  `\n${findings.length} string${findings.length === 1 ? "" : "s"} in ${byFile.size} file${byFile.size === 1 ? "" : "s"} read like words for a person but are not translated.`,
);
if (CHECK) {
  console.error(
    "Move them to packages/i18n (or list them in scripts/i18n/literal-allowlist.json with the reason).",
  );
  process.exit(1);
}
