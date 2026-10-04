#!/usr/bin/env node
// Every literal in-app address points at a route that exists.
//
// A link written as a string ("/places", "/(app)/messages") is checked by
// nothing: the type checker sees a string, the router answers 404 or a blank
// screen only when someone taps it. On 2026-10-04 the favourites page sent
// people with no saved places to "/places" (a page that does not exist),
// and the chat header's fallback went to "/(app)/messages" while every
// other screen used "/(app)/(tabs)/messages".
//
// This reads the route folders of the website (apps/web/src/app, Next.js:
// page.tsx and route.ts; groups "(x)" and the [locale] segment are not part
// of the address) and of the app (apps/mobile/app, Expo Router: every file,
// groups optional), then every literal href / push / replace / redirect /
// navigate in each app's sources, and fails on a target no route matches.
// Addresses built at run time are not checked.
//
//   node scripts/check-route-links.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) => relative(ROOT, p).split(sep).join("/");

function walk(dir, keep, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, keep, out);
    else if (keep(full)) out.push(full);
  }
  return out;
}

const isGroup = (s) => s.startsWith("(") && s.endsWith(")");
const toPattern = (segments) =>
  new RegExp(
    `^/${segments
      .map((s) =>
        s.startsWith("[") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/")}$`,
  );

// ---- website ---------------------------------------------------------------

const WEB_APP = join(ROOT, "apps/web/src/app");
const webRoutes = walk(WEB_APP, (f) => /[\\/](page\.tsx|route\.ts)$/.test(f))
  .map((f) => rel(f).slice("apps/web/src/app/".length).split("/").slice(0, -1))
  .map((parts) =>
    toPattern(parts.filter((p) => !isGroup(p) && p !== "[locale]")),
  );

// ---- app -------------------------------------------------------------------

const MOBILE_APP = join(ROOT, "apps/mobile/app");
const mobileRoutes = [];
for (const f of walk(MOBILE_APP, (f) => /\.tsx$/.test(f))) {
  const parts = rel(f)
    .slice("apps/mobile/app/".length)
    .replace(/\.tsx$/, "")
    .split("/");
  const name = parts[parts.length - 1];
  if (name.startsWith("_") || name.startsWith("+")) continue;
  if (name === "index") parts.pop();
  mobileRoutes.push(toPattern(parts));
  mobileRoutes.push(toPattern(parts.filter((p) => !isGroup(p))));
}

// ---- links -----------------------------------------------------------------

const LINK =
  /(?:href=|\b(?:push|replace|redirect|navigate)\()\s*["'`](\/[A-Za-z0-9_\-/()?=&.[\]]*)["'`]/g;

function check(sources, routes, skip) {
  const failures = [];
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(LINK)) {
      const target = m[1];
      if (skip(target)) continue;
      const path = target.split(/[?#]/)[0].replace(/\/$/, "") || "/";
      if (!routes.some((r) => r.test(path))) {
        const line = text.slice(0, m.index).split("\n").length;
        failures.push(`${rel(file)}:${line}  ${target}`);
      }
    }
  }
  return failures;
}

const webSources = walk(
  join(ROOT, "apps/web/src"),
  (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f),
);
const mobileSources = [
  ...walk(MOBILE_APP, (f) => /\.(ts|tsx)$/.test(f)),
  ...walk(join(ROOT, "apps/mobile/src"), (f) => /\.(ts|tsx)$/.test(f)),
];

const failures = [
  ...check(
    webSources,
    webRoutes,
    // API routes, Next's own files and static files in /public.
    (t) =>
      t.startsWith("/api/") ||
      t.startsWith("/_next") ||
      /\.[a-z0-9]+$/i.test(t.split(/[?#]/)[0]),
  ),
  ...check(mobileSources, mobileRoutes, () => false),
];

if (failures.length > 0) {
  console.error("Links to an address no route answers:\n");
  for (const f of failures) console.error(`  ${f}`);
  console.error(
    "\nPoint them at an existing route (apps/web/src/app, apps/mobile/app).",
  );
  process.exit(1);
}
console.log(
  `route links: every literal address resolves (${webRoutes.length} web routes, ${mobileRoutes.length / 2} app routes).`,
);
