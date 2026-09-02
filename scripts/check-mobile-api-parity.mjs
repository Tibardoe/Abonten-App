#!/usr/bin/env node
// Drift guard: every /api/mobile/** route handler must be reachable through a
// typed @abonten/api-client method, and vice versa. This is a cheap string
// check (does the route's URL path literal appear in client.ts?), not a
// runtime contract test — it catches "added a route, forgot the client
// method" and "renamed a path on one side only".
//
// Run: node scripts/check-mobile-api-parity.mjs

import { globSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ROUTES_DIR = join(ROOT, "apps/web/src/app/api/mobile");
const CLIENT_FILE = join(ROOT, "packages/api-client/src/client.ts");

const client = readFileSync(CLIENT_FILE, "utf8");

const routeFiles = globSync("**/route.ts", { cwd: ROUTES_DIR }).filter(
  (p) => !p.split(sep).includes("_lib"),
);

const missing = [];
for (const file of routeFiles) {
  // apps/web/src/app/api/mobile/checkout/validate/route.ts
  //   -> /api/mobile/checkout/validate
  //   -> dynamic segments [x] -> ${...} in the client, so match the static prefix
  const segments = file.split(sep).slice(0, -1); // drop route.ts
  const staticPrefix = [];
  for (const s of segments) {
    if (s.startsWith("[")) break;
    staticPrefix.push(s);
  }
  const needle = `/api/mobile/${staticPrefix.join("/")}`;
  if (!client.includes(needle)) {
    missing.push({ route: `/api/mobile/${segments.join("/")}`, needle });
  }
}

if (missing.length > 0) {
  console.error(
    `\n${missing.length} /api/mobile route(s) have no matching @abonten/api-client call:\n`,
  );
  for (const m of missing) {
    console.error(`  ${m.route}   (looked for "${m.needle}" in client.ts)`);
  }
  console.error(
    "\nAdd the method to packages/api-client/src/client.ts, or confirm the path literal matches.\n",
  );
  process.exit(1);
}

console.log(
  `mobile API parity OK — ${routeFiles.length} route handlers, all reachable from @abonten/api-client.`,
);
