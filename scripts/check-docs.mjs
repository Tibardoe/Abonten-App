#!/usr/bin/env node
// Documentation validation for the Abonten monorepo. Dependency-free, same
// spirit as check-mobile-api-parity.mjs: cheap textual checks that catch the
// drift a human would otherwise only notice months later.
//
//   node scripts/check-docs.mjs             offline rules
//   node scripts/check-docs.mjs --external  also probe external links
//
// Rules (see docs/development/documentation-validation.md):
//   required-files · metadata · internal-links · code-references · placeholders
//   social-links · secrets · public-internal-separation · terminology
// Warnings never fail the run: draft/review status counts, POLICY DECISION
// REQUIRED occurrences, skipped external links.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXTERNAL = process.argv.includes("--external");

const rel = (p) => relative(ROOT, p).split(sep).join("/");
const read = (p) => readFileSync(p, "utf8");

const failures = [];
const warnings = [];
const fail = (rule, file, line, msg) =>
  failures.push(`${rule.padEnd(28)} ${file}${line ? `:${line}` : ""}  ${msg}`);
const warn = (rule, file, line, msg) =>
  warnings.push(`${rule.padEnd(28)} ${file}${line ? `:${line}` : ""}  ${msg}`);

// ---- file discovery ---------------------------------------------------------

function walk(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, predicate, out);
    } else if (predicate(full)) out.push(full);
  }
  return out;
}

const DOCS_DIR = join(ROOT, "docs");
const CONTENT_DIR = join(ROOT, "apps/web/src/content");
const docFiles = walk(DOCS_DIR, (f) => f.endsWith(".md"));
const contentFiles = walk(CONTENT_DIR, (f) => f.endsWith(".md"));
const allMarkdown = [...docFiles, ...contentFiles];

// Pre-existing documents that predate the metadata standard; they are listed
// as history/reference in INDEX.md and are not required to carry the block.
const METADATA_EXEMPT = [
  /^docs\/mobile\/\d\d-.*\.md$/,
  /^docs\/audit\/.*\.md$/,
  /^docs\/architecture\/(shared-backend|rewards-ledger|field-ops|email-auth)\.md$/,
];
const isLegacy = (r) => METADATA_EXEMPT.some((re) => re.test(r));
// The two documents that describe the rules necessarily quote the forbidden
// phrases; they are excluded from the placeholder and terminology rules.
const RULE_DOCS = new Set([
  "docs/development/documentation-validation.md",
  "docs/DOCUMENTATION_STANDARD.md",
]);

// ---- front matter -----------------------------------------------------------

function frontMatter(source) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return null;
  const fm = {};
  for (const raw of lines.slice(1, end)) {
    const m = raw.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return fm;
}

const STATUSES = new Set([
  "Draft",
  "Review required",
  "Approved",
  "Published",
  "Deprecated",
]);
const INTERNAL_KEYS = [
  "title",
  "purpose",
  "audience",
  "scope",
  "status",
  "version",
  "lastReviewed",
  "technicalOwner",
  "businessOwner",
  "legalReviewRequired",
  "complianceReviewRequired",
];
const LEGAL_KEYS = [
  "title",
  "summary",
  "version",
  "effectiveDate",
  "lastUpdated",
  "status",
];
const HELP_KEYS = ["title", "summary", "order", "lastUpdated", "status"];

// ---- rule: required files ---------------------------------------------------

const REQUIRED = [
  "docs/INDEX.md",
  "docs/README.md",
  "docs/DOCUMENTATION_STANDARD.md",
  "docs/LEGAL_REVIEW_REQUIRED.md",
  "docs/OPERATIONAL_DECISIONS_REQUIRED.md",
  "docs/documentation-audit-matrix.md",
  "docs/documentation-coverage-matrix.md",
  "docs/specifications/README.md",
  "docs/architecture/observability.md",
  "docs/deployment/disaster-recovery.md",
  "docs/changelog/README.md",
  "apps/web/src/content/legal/terms.md",
  "apps/web/src/content/legal/privacy-policy.md",
  "apps/web/src/content/legal/cookie-policy.md",
  "apps/web/src/content/legal/security.md",
  "packages/core/src/brand/socialLinks.ts",
  ...[
    "legal",
    "privacy/data-inventory.md",
    "security",
    "incident-response",
    "admin",
    "field-operations",
    "finance",
    "operations/what-do-i-do-when.md",
    "troubleshooting",
    "journeys",
    "web",
    "mobile",
    "user-guide",
    "architecture",
    "development",
    "deployment",
  ].map((p) => (p.endsWith(".md") ? `docs/${p}` : `docs/${p}/README.md`)),
];
for (const f of REQUIRED) {
  if (!existsSync(join(ROOT, f))) fail("required-files", f, 0, "missing");
}
for (const section of ["customers", "organizers", "place-owners", "account"]) {
  const dir = join(CONTENT_DIR, "help", section);
  if (
    !existsSync(dir) ||
    readdirSync(dir).filter((f) => f.endsWith(".md")).length === 0
  ) {
    fail(
      "required-files",
      `apps/web/src/content/help/${section}/`,
      0,
      "no help pages",
    );
  }
}

// ---- rule: metadata ---------------------------------------------------------

let draftCount = 0;
let policyDecisionCount = 0;
for (const file of allMarkdown) {
  const r = rel(file);
  const src = read(file);
  const fm = frontMatter(src);
  const isContent = r.startsWith("apps/web/src/content/");
  if (isLegacy(r)) continue;
  const required = isContent
    ? r.includes("/content/legal/")
      ? LEGAL_KEYS
      : HELP_KEYS
    : INTERNAL_KEYS;
  if (!fm) {
    fail("metadata", r, 1, "missing front matter block");
    continue;
  }
  for (const key of required) {
    if (!(key in fm) || fm[key] === "")
      fail("metadata", r, 1, `missing "${key}"`);
  }
  if (fm.status && !STATUSES.has(fm.status)) {
    fail("metadata", r, 1, `invalid status "${fm.status}"`);
  }
  if (fm.status === "Draft" || fm.status === "Review required") draftCount++;
  policyDecisionCount += (src.match(/POLICY DECISION REQUIRED/g) ?? []).length;
}

// ---- rule: internal links ---------------------------------------------------

const LEGAL_SLUGS = new Set(["terms", "privacy", "cookies", "security"]);
const helpPages = new Set(
  contentFiles
    .filter((f) => rel(f).includes("/content/help/"))
    .map((f) =>
      rel(f).replace("apps/web/src/content/help/", "").replace(/\.md$/, ""),
    ),
);

function forEachLink(src, cb) {
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const lines = src.split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(re)) cb(m[1], i + 1);
  });
}

const externalLinks = new Map(); // url -> first file
for (const file of allMarkdown) {
  const r = rel(file);
  const src = read(file);
  forEachLink(src, (target, line) => {
    if (/^(https?:)?\/\//i.test(target)) {
      if (!externalLinks.has(target)) externalLinks.set(target, `${r}:${line}`);
      return;
    }
    if (target.startsWith("mailto:") || target.startsWith("#")) return;
    if (target.startsWith("/")) {
      const path = target.split("#")[0].split("?")[0];
      if (path === "/legal" || path === "/help") return;
      const legal = path.match(/^\/legal\/([a-z-]+)$/);
      if (legal) {
        if (!LEGAL_SLUGS.has(legal[1]))
          fail("internal-links", r, line, `unknown legal page ${path}`);
        return;
      }
      const help = path.match(/^\/help\/([a-z-]+\/[a-z0-9-]+)$/);
      if (help) {
        if (!helpPages.has(help[1]))
          fail("internal-links", r, line, `unknown help page ${path}`);
        return;
      }
      return; // other site routes are not validated here
    }
    const clean = target.split("#")[0];
    if (!clean) return;
    const resolved = resolve(dirname(file), decodeURIComponent(clean));
    if (!existsSync(resolved))
      fail("internal-links", r, line, `broken link ${target}`);
  });
}

// ---- rule: code references (backticked repo paths) --------------------------

const CODE_REF =
  /`((?:apps|packages|scripts|supabase|docs|\.github)\/[^`\s]+)`/g;
for (const file of docFiles) {
  const r = rel(file);
  if (isLegacy(r)) continue; // historical logs reference paths that have since moved
  const src = read(file);
  src.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(CODE_REF)) {
      let p = m[1];
      if (/[*{}]/.test(p) || p.includes("…") || p.includes("<")) continue;
      p = p.replace(/:\d+(-\d+)?$/, "").replace(/\/$/, "");
      if (!existsSync(join(ROOT, p))) {
        fail("code-references", r, i + 1, `path does not exist: ${m[1]}`);
      }
    }
  });
}

// ---- rule: placeholders -----------------------------------------------------

const UI_FILES = [
  "apps/web/src/components/organisms/DesktopFooter.tsx",
  "apps/web/src/components/organisms/MobileFooter.tsx",
  "apps/web/src/components/organisms/SideBar.tsx",
  "apps/mobile/src/components/app/AppDrawer.tsx",
  "apps/mobile/app/(auth)/sign-in.tsx",
];
for (const f of UI_FILES) {
  const full = join(ROOT, f);
  if (!existsSync(full)) continue;
  read(full)
    .split("\n")
    .forEach((line, i) => {
      if (/href=["']#["']/.test(line))
        fail("placeholders", f, i + 1, 'dead link href="#"');
      if (/https?:\/\/abonten\.com\//.test(line))
        fail("placeholders", f, i + 1, "abonten.com is not our domain");
    });
}
for (const file of allMarkdown) {
  const r = rel(file);
  if (RULE_DOCS.has(r)) continue;
  read(file)
    .split("\n")
    .forEach((line, i) => {
      if (/https?:\/\/abonten\.com\//.test(line))
        fail("placeholders", r, i + 1, "abonten.com is not our domain");
      if (/\b(TODO_URL|lorem ipsum)\b/i.test(line))
        fail("placeholders", r, i + 1, "placeholder text");
      if (/https?:\/\/(www\.)?example\.com/.test(line))
        fail("placeholders", r, i + 1, "example.com placeholder URL");
    });
}

// ---- rule: social links -----------------------------------------------------

const OFFICIAL = {
  x: "https://x.com/abontenhub?s=11&t=gZ2B02snHyBqRmj-V9sbhg",
  instagram:
    "https://www.instagram.com/abontenhub?stkn=N3M1N2ZmMHp5YTN0&utm_source=qr",
  tiktok: "https://www.tiktok.com/@abontenhub?_r=1&_t=ZS-99ce4w5TDZx",
};
const brandFile = join(ROOT, "packages/core/src/brand/socialLinks.ts");
if (existsSync(brandFile)) {
  const brand = read(brandFile);
  for (const [k, url] of Object.entries(OFFICIAL)) {
    if (!brand.includes(url))
      fail("social-links", rel(brandFile), 0, `official ${k} URL missing`);
  }
}
const socialScan = [
  ...walk(join(ROOT, "apps/web/src"), (f) => /\.(tsx?|md)$/.test(f)),
  ...walk(join(ROOT, "apps/mobile/app"), (f) => /\.tsx?$/.test(f)),
  ...walk(join(ROOT, "apps/mobile/src"), (f) => /\.tsx?$/.test(f)),
  ...docFiles,
];
const SOCIAL_URL =
  /https?:\/\/(?:www\.)?(x\.com|twitter\.com|instagram\.com|tiktok\.com)\/@?abontenhub[^\s"')`>]*/g;
for (const file of socialScan) {
  const r = rel(file);
  if (r === rel(brandFile)) continue;
  read(file)
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(SOCIAL_URL)) {
        if (!Object.values(OFFICIAL).includes(m[0])) {
          fail(
            "social-links",
            r,
            i + 1,
            `non-official Abonten social URL ${m[0]} (use @abonten/core/brand/socialLinks)`,
          );
        }
      }
    });
}

// ---- rule: secrets ----------------------------------------------------------

const ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_WEBHOOK_SECRET",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "HUBTEL_API_CLIENT_ID",
  "HUBTEL_API_CLIENT_SECRET",
  "RESEND_API_KEY",
  "OBSERVABILITY_INGEST_SECRET",
  "SENTRY_AUTH_TOKEN",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "EXPO_PUBLIC_GOOGLE_MAPS_API_KEY",
  "ADMIN_EMAIL_ALLOWLIST",
  "EXPO_ACCESS_TOKEN",
];
const SECRET_PATTERNS = [
  [/\bsk_(live|test)_[A-Za-z0-9]{10,}/, "Paystack-style secret key"],
  [/\bpk_(live|test)_[A-Za-z0-9]{10,}/, "Paystack-style public key literal"],
  [/\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{10,}/, "JWT"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\bre_[A-Za-z0-9]{20,}\b/, "Resend API key"],
  [/\bsbp_[A-Za-z0-9]{20,}\b/, "Supabase access token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [
    new RegExp(
      `\\b(${ENV_NAMES.join("|")})\\s*[=:]\\s*["']?[A-Za-z0-9_\\-./+]{16,}`,
    ),
    "env var with a value",
  ],
];
for (const file of [...allMarkdown, join(ROOT, "README.md")]) {
  if (!existsSync(file)) continue;
  const r = rel(file);
  read(file)
    .split("\n")
    .forEach((line, i) => {
      for (const [re, label] of SECRET_PATTERNS) {
        if (re.test(line)) fail("secrets", r, i + 1, `looks like a ${label}`);
      }
    });
}

// ---- rule: public / internal separation ------------------------------------

const PUBLIC_FORBIDDEN = [
  [
    /\b(apps|packages|supabase|scripts)\/[A-Za-z0-9_./\-[\]()]+/,
    "repository path",
  ],
  [
    new RegExp(
      `\\b(${ENV_NAMES.join("|")}|[A-Z_]*_KILL_SWITCH|NEXT_PUBLIC_[A-Z_]+|EXPO_PUBLIC_[A-Z_]+)\\b`,
    ),
    "environment variable name",
  ],
  [
    /\b(fieldops_[a-z_]+|credit_(account|lot|journal|entry|reservation|ledger_account)|admin_(user|role|audit_log|permission|note)|reward_(event|rule|outbox|program_setting)|payment_attempt|ticket_checkout|organizer_ledger_entry|notification_preference|notification_delivery|user_info|risk_signal|platform_fee_entry)\b/,
    "internal table name",
  ],
  [
    /\b(users|finance|moderation|reports|rewards|fieldops|settings|admins|notifications|claims|monitoring|incidents|audit|support)\.(view_pii|view|refund|payout|adjust|hide|remove|restore|restrict|manage|rules|verify|review|freeze|goodwill|configure|withdrawals|resolve|send|broadcast|suspend|ban|assign|escalate|note|respond|commissions\.approve|commissions\.pay)\b/,
    "permission key",
  ],
  [/\bSECURITY DEFINER\b/, "privileged implementation detail"],
];
for (const file of contentFiles) {
  const r = rel(file);
  read(file)
    .split("\n")
    .forEach((line, i) => {
      for (const [re, label] of PUBLIC_FORBIDDEN) {
        if (re.test(line))
          fail(
            "public-internal-separation",
            r,
            i + 1,
            `${label} in public content: ${line.trim().slice(0, 80)}`,
          );
      }
    });
}

// ---- rule: terminology ------------------------------------------------------

const TERMS = [
  [
    /\bvenue owners?\b(?![^.\n]*rebate)/i,
    'use "place owner" (except the "venue rebate" reward name)',
  ],
  [/\bwallet credit\b/i, 'use "Abonten Credit"'],
  [/\bAbonten Credits\b/, 'use the singular "Abonten Credit"'],
];
for (const file of allMarkdown) {
  const r = rel(file);
  if (RULE_DOCS.has(r) || isLegacy(r)) continue;
  read(file)
    .split("\n")
    .forEach((line, i) => {
      for (const [re, msg] of TERMS) {
        if (re.test(line)) fail("terminology", r, i + 1, msg);
      }
    });
}

// ---- rule: contacts (official addresses only, quoted exactly) --------------

// The three official mailboxes designated by the founder (legal item A3).
// The legal pages must quote them verbatim; no other @abontenhub.com address
// and no personal mailbox (gmail etc.) may appear in docs or public content.
const OFFICIAL_CONTACTS = {
  support: "support@abontenhub.com",
  privacy: "privacy@abontenhub.com",
  security: "security@abontenhub.com",
};
// Outbound-only sender addresses used by the app's transactional email
// (Resend) or given as the SMTP sender example. They may be named in docs but
// are not contact channels and must never be presented as one.
const SYSTEM_SENDERS = new Set([
  "tickets@abontenhub.com",
  "rewards@abontenhub.com",
  "no-reply@abontenhub.com",
]);
const contactsFile = join(ROOT, "packages/core/src/brand/contacts.ts");
if (!existsSync(contactsFile)) {
  fail("contacts", "packages/core/src/brand/contacts.ts", 0, "missing");
} else {
  const src = read(contactsFile);
  for (const [k, addr] of Object.entries(OFFICIAL_CONTACTS)) {
    const local = addr.split("@")[0];
    if (!src.includes(`\`${local}@\${CONTACT_DOMAIN}\``) && !src.includes(addr))
      fail("contacts", rel(contactsFile), 0, `official ${k} address missing`);
  }
  if (!src.includes('CONTACT_DOMAIN = "abontenhub.com"'))
    fail(
      "contacts",
      rel(contactsFile),
      0,
      "CONTACT_DOMAIN must be abontenhub.com",
    );
}
const CONTACT_EXPECTATIONS = {
  "apps/web/src/content/legal/terms.md": ["support", "privacy", "security"],
  "apps/web/src/content/legal/privacy-policy.md": ["privacy", "support"],
  "apps/web/src/content/legal/security.md": ["security"],
};
for (const [file, keys] of Object.entries(CONTACT_EXPECTATIONS)) {
  const full = join(ROOT, file);
  if (!existsSync(full)) continue;
  const src = read(full);
  for (const k of keys) {
    if (!src.includes(OFFICIAL_CONTACTS[k]))
      fail("contacts", file, 0, `must quote ${OFFICIAL_CONTACTS[k]}`);
  }
}
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PERSONAL_MAIL = /@(gmail|yahoo|hotmail|outlook|icloud|proton(mail)?)\./i;
for (const file of allMarkdown) {
  const r = rel(file);
  if (RULE_DOCS.has(r)) continue;
  read(file)
    .split("\n")
    .forEach((line, i) => {
      for (const m of line.matchAll(EMAIL_RE)) {
        const addr = m[0];
        if (/@abontenhub\.com$/i.test(addr)) {
          const lower = addr.toLowerCase();
          if (
            !Object.values(OFFICIAL_CONTACTS).includes(lower) &&
            !SYSTEM_SENDERS.has(lower)
          )
            fail(
              "contacts",
              r,
              i + 1,
              `non-official @abontenhub.com address ${addr} (only support@, privacy@, security@ may be published)`,
            );
        } else if (PERSONAL_MAIL.test(addr)) {
          fail(
            "contacts",
            r,
            i + 1,
            `personal mailbox ${addr} in documentation`,
          );
        }
      }
    });
}

// ---- rule: coverage (every document reachable from the hub) ----------------

function linkedTargets(file) {
  const out = new Set();
  if (!existsSync(file)) return out;
  forEachLink(read(file), (target) => {
    if (
      /^(https?:)?\/\//i.test(target) ||
      target.startsWith("/") ||
      target.startsWith("#") ||
      target.startsWith("mailto:")
    )
      return;
    const clean = target.split("#")[0];
    if (clean) out.add(resolve(dirname(file), decodeURIComponent(clean)));
  });
  return out;
}

const hubLinks = linkedTargets(join(DOCS_DIR, "INDEX.md"));
const coverageLinks = linkedTargets(
  join(DOCS_DIR, "documentation-coverage-matrix.md"),
);
const readmeLinkCache = new Map();
for (const file of docFiles) {
  const r = rel(file);
  if (isLegacy(r) || r === "docs/INDEX.md") continue;
  const folderReadme = join(dirname(file), "README.md");
  if (!readmeLinkCache.has(folderReadme))
    readmeLinkCache.set(folderReadme, linkedTargets(folderReadme));
  const reachable =
    hubLinks.has(resolve(file)) ||
    (resolve(folderReadme) !== resolve(file) &&
      readmeLinkCache.get(folderReadme).has(resolve(file)));
  if (!reachable)
    fail(
      "coverage",
      r,
      1,
      "not linked from docs/INDEX.md or its folder README.md",
    );
}
for (const file of contentFiles) {
  if (!coverageLinks.has(resolve(file)))
    fail(
      "coverage",
      rel(file),
      1,
      "public page not referenced from docs/documentation-coverage-matrix.md",
    );
}

// ---- rule: legal placeholders ----------------------------------------------

// Explicit tokens stand in for details the founder has not provided (entity,
// address, contacts, effective date). They are allowed — expected, even — in
// a draft, and forbidden once a legal document is Published or Approved.
const PLACEHOLDER = /\[[A-Z][A-Z /]+ — TO BE CONFIRMED\]/g;
let placeholderCount = 0;
for (const file of contentFiles) {
  const r = rel(file);
  if (!r.includes("/content/legal/")) continue;
  const src = read(file);
  const fm = frontMatter(src) ?? {};
  const n = (src.match(PLACEHOLDER) ?? []).length;
  placeholderCount += n;
  const isFinal = fm.status === "Published" || fm.status === "Approved";
  if (!isFinal) continue;
  if (n > 0)
    fail(
      "legal-placeholders",
      r,
      1,
      `${n} "TO BE CONFIRMED" placeholder(s) remain in a ${fm.status} document`,
    );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.effectiveDate ?? ""))
    fail(
      "legal-placeholders",
      r,
      1,
      `a ${fm.status} legal document needs a real effectiveDate (YYYY-MM-DD)`,
    );
}
warn(
  "legal-placeholders",
  "—",
  0,
  `${placeholderCount} "TO BE CONFIRMED" placeholder(s) in the public legal documents`,
);

// ---- external links (opt-in) -----------------------------------------------

async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    let res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }
    return { status: res.status };
  } catch (error) {
    return {
      error:
        error?.name === "AbortError"
          ? "timeout"
          : String(error?.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

if (EXTERNAL) {
  // The official social accounts live in a TS constant, not a Markdown link;
  // probe them too so a dead account is noticed.
  for (const [k, url] of Object.entries(OFFICIAL)) {
    if (!externalLinks.has(url))
      externalLinks.set(url, `packages/core/src/brand/socialLinks.ts (${k})`);
  }
  const entries = [...externalLinks.entries()].filter(([u]) =>
    /^https?:/i.test(u),
  );
  console.log(`Probing ${entries.length} external link(s)…`);
  for (const [url, where] of entries) {
    const r = await probe(url);
    if (r.error) warn("external-links", where, 0, `${url} — ${r.error}`);
    else if (r.status === 404 || r.status >= 500)
      fail("external-links", where, 0, `${url} → HTTP ${r.status}`);
    else if (r.status >= 400)
      warn(
        "external-links",
        where,
        0,
        `${url} → HTTP ${r.status} (bot protection?)`,
      );
  }
} else {
  warn(
    "external-links",
    "—",
    0,
    `${externalLinks.size} external link(s) not probed (run with --external)`,
  );
}

// ---- report -----------------------------------------------------------------

warn(
  "status",
  "—",
  0,
  `${draftCount} document(s) are Draft or Review required`,
);
warn(
  "decisions",
  "—",
  0,
  `${policyDecisionCount} "POLICY DECISION REQUIRED" marker(s)`,
);

for (const w of warnings) console.log(`warn  ${w}`);
if (failures.length) {
  console.error(`\n${failures.length} documentation check failure(s):\n`);
  for (const f of failures) console.error(`FAIL  ${f}`);
  process.exit(1);
}
console.log(
  `\ndocs OK — ${docFiles.length} internal + ${contentFiles.length} public documents checked.`,
);
