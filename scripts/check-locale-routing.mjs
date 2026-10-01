#!/usr/bin/env node
// Guards the web app's locale routing (apps/web/src/i18n/routing.ts).
//
// Every page is rendered under app/[locale] and the proxy rewrites public
// addresses there, so two mistakes would silently break a language:
//   1. a page or layout added outside app/[locale] — it would render in
//      English only, outside the providers, and its address would never
//      be rewritten;
//   2. a direct revalidatePath("/events/x") — Next's cache is keyed by the
//      internal route "/fr/events/x", so the call would miss every cached
//      translation. revalidateAppPath() covers all of them.
//
// Run: node scripts/check-locale-routing.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = join(ROOT, "apps/web/src/app");
const SRC = join(ROOT, "apps/web/src");
const HELPER = "lib/revalidateAppPath.ts";

const ROUTE_FILES = new Set([
  "page.tsx",
  "layout.tsx",
  "template.tsx",
  "not-found.tsx",
  "error.tsx",
  "loading.tsx",
  "default.tsx",
]);

// Files that legitimately live outside app/[locale].
const ROOT_ALLOWED = new Set([
  "global-error.tsx",
  "robots.ts",
  "sitemap.ts",
  "fonts.ts",
  "globals.css",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

const problems = [];

for (const file of walk(APP)) {
  const rel = relative(APP, file).split(sep).join("/");
  if (rel.startsWith("[locale]/")) continue;
  if (rel.startsWith("api/") || rel.startsWith("go/")) continue;
  if (ROOT_ALLOWED.has(rel)) continue;
  const base = rel.split("/").pop() ?? "";
  if (ROUTE_FILES.has(base)) {
    problems.push(
      `${rel}: route file outside app/[locale] (it would render in English only)`,
    );
  }
}

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).split(sep).join("/");
  if (!/\.(ts|tsx)$/.test(rel) || rel === HELPER) continue;
  const text = readFileSync(file, "utf8");
  if (
    /\brevalidatePath\s*\(/.test(text) &&
    !/^\s*(\/\/|\*)/m.test(
      text
        .split(/\brevalidatePath\s*\(/)[0]
        .split("\n")
        .pop() ?? "",
    )
  ) {
    // Ignore mentions inside comments: only a real call counts.
    const lines = text.split("\n");
    const callLines = lines
      .map((l, i) => [l, i + 1])
      .filter(
        ([l]) =>
          /\brevalidatePath\s*\(/.test(l) && !/^\s*(\/\/|\*|\/\*)/.test(l),
      );
    for (const [, n] of callLines) {
      problems.push(
        `${rel}:${n}: direct revalidatePath() — use revalidateAppPath() from @/lib/revalidateAppPath`,
      );
    }
  }
}

if (problems.length) {
  console.error("Locale routing problems:");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  "locale routing: every route is under app/[locale] and revalidation goes through revalidateAppPath().",
);
