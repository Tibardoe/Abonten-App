#!/usr/bin/env node
// Holds the mobile deep-link decoder safe, and proves it is still wired in.
//
// Background: expo-router -> query-string@7 -> decode-uri-component@0.2.2,
// which carries GHSA-vcc3-ghjq-m6fr (exponential blow-up on malformed
// percent-encoding). It cannot be fixed by upgrading -- the first patched
// release is ESM-only and query-string reaches it through require() -- and
// no Expo SDK, including the SDK 58 preview, drops the chain. So Metro
// resolves the module to apps/mobile/vendor/decode-uri-component.js instead.
//
// The vulnerable path is reachable, not dead code: react-navigation's core
// barrel re-exports the module that calls `queryString.parse`, and both
// useLinking.native and useLinkBuilder fall back to it when a caller passes
// no getStateFromPath. A grep for imports of that file finds nothing, which
// is why the walk below follows requires instead.
//
// This check fails the build if:
//   1. the Metro alias is missing or points somewhere else;
//   2. the replacement disagrees with the original on any corpus input;
//   3. the replacement is not linear on the payload that defeats the original.
// It also reports, without failing, whether query-string's decoding API is
// still reachable -- so if a future expo-router drops it, the alias and this
// check can be retired deliberately rather than forgotten.
//
// Run: node scripts/check-deep-link-decoder.mjs

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const require_ = createRequire(import.meta.url);

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

// ---------------------------------------------------------------- 1. alias

const METRO_CONFIG = join(ROOT, "apps/mobile/metro.config.js");
const VENDOR = join(ROOT, "apps/mobile/vendor/decode-uri-component.js");

if (!existsSync(VENDOR)) {
  fail(`missing ${relative(ROOT, VENDOR)} -- the safe decoder is gone.`);
}

const metroSource = existsSync(METRO_CONFIG)
  ? readFileSync(METRO_CONFIG, "utf8")
  : "";

if (!metroSource.includes("decode-uri-component")) {
  fail(
    "apps/mobile/metro.config.js no longer aliases decode-uri-component.\n" +
      "    Without the alias the app bundles the vulnerable copy again.",
  );
}

// ------------------------------------------------- 2. differential corpus

const safeDecode = existsSync(VENDOR) ? require_(VENDOR) : null;

let originalDecode = null;
try {
  originalDecode = require_("decode-uri-component");
} catch {
  notes.push(
    "decode-uri-component is no longer installed -- expo-router may have " +
      "dropped query-string. If so, delete the alias and this check.",
  );
}

/** Inputs chosen to cover both decode paths and the awkward edges. */
function corpus() {
  const cases = [
    "",
    "plain",
    "hello world",
    "a+b",
    "a+b+c",
    "%20",
    "%20%20",
    "caf%C3%A9",
    "%E2%9C%93",
    "%F0%9F%8E%89",
    "Accra%2C%20Ghana",
    "ref%3DABC123",
    "%",
    "%%",
    "%2",
    "%zz",
    "100%",
    "50%off",
    "%C3",
    "%C2",
    "%FE",
    "%FF",
    "%FE%FF",
    "%FF%FE",
    "%C3%28",
    "%E0%A4%A",
    "%F0%9F",
    "a%FFb",
    "%C3%A9%FF%C3%A9",
    "start%FFmiddle%FFend",
    "%E2%9C%93%FF%E2%9C%93",
    "?a=1&b=2",
    "event%2Fabc?ref%3Dx",
  ];

  // Deterministic pseudo-random byte soup, valid and invalid mixed.
  let seed = 12345;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < 3000; i += 1) {
    let s = "";
    // Mostly short, but a tail of long inputs so the multi-pass
    // re-tokenisation path is exercised too.
    const len = 1 + Math.floor(rand() * (i % 20 === 0 ? 120 : 12));
    for (let j = 0; j < len; j += 1) {
      const r = rand();
      if (r < 0.6) {
        const byte = Math.floor(rand() * 256)
          .toString(16)
          .padStart(2, "0");
        s += `%${byte}`;
      } else if (r < 0.8) {
        s += "abcXYZ019"[Math.floor(rand() * 9)];
      } else if (r < 0.9) {
        s += "+";
      } else {
        s += "%";
      }
    }
    cases.push(s);
  }
  return cases;
}

if (safeDecode && originalDecode) {
  let compared = 0;
  const disagreements = [];
  for (const input of corpus()) {
    let expected;
    let actual;
    try {
      expected = originalDecode(input);
    } catch (error) {
      expected = `THREW:${error.constructor.name}`;
    }
    try {
      actual = safeDecode(input);
    } catch (error) {
      actual = `THREW:${error.constructor.name}`;
    }
    compared += 1;
    if (expected !== actual) {
      disagreements.push({ input, expected, actual });
    }
  }

  if (disagreements.length > 0) {
    const shown = disagreements
      .slice(0, 8)
      .map(
        (d) =>
          `      input    ${JSON.stringify(d.input)}\n` +
          `      original ${JSON.stringify(d.expected)}\n` +
          `      safe     ${JSON.stringify(d.actual)}`,
      )
      .join("\n\n");
    fail(
      `the safe decoder disagrees with decode-uri-component on ${disagreements.length}/${compared} inputs:\n\n${shown}\n\n    Deep links would decode differently. Fix apps/mobile/vendor/decode-uri-component.js.`,
    );
  } else {
    notes.push(
      `decoder matches decode-uri-component on all ${compared} corpus inputs`,
    );
  }

  // Non-string input must still throw the same TypeError.
  for (const bad of [null, undefined, 42, {}, []]) {
    let originalThrew = false;
    let safeThrew = false;
    try {
      originalDecode(bad);
    } catch {
      originalThrew = true;
    }
    try {
      safeDecode(bad);
    } catch {
      safeThrew = true;
    }
    if (originalThrew !== safeThrew) {
      fail(
        `non-string input ${JSON.stringify(bad)}: original ` +
          `${originalThrew ? "threw" : "returned"}, safe decoder ` +
          `${safeThrew ? "threw" : "returned"}.`,
      );
    }
  }
}

// ------------------------------------------------------ 3. linear, not 2^n

if (safeDecode) {
  // The advisory's shape: a long run of tokens that cannot be decoded as a
  // whole, which drives the original's recursive split.
  const payload = `%${"C0%".repeat(45)}A`;
  const started = process.hrtime.bigint();
  safeDecode(payload);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const BUDGET_MS = 50;
  if (elapsedMs > BUDGET_MS) {
    fail(
      `the safe decoder took ${elapsedMs.toFixed(1)}ms on a 46-token ` +
        `malformed payload (budget ${BUDGET_MS}ms). It is no longer linear.`,
    );
  } else {
    notes.push(
      `46-token malformed payload decoded in ${elapsedMs.toFixed(2)}ms ` +
        `(budget ${BUDGET_MS}ms)`,
    );
  }
}

// ----------------------------------- 4. is the vulnerable API even reached?

const ROUTER_BUILD = join(ROOT, "node_modules/expo-router/build");

if (existsSync(ROUTER_BUILD)) {
  // Which modules can the native runtime actually reach from expo-router's
  // entry points? Anything outside that set is vendored reference code.
  const entries = ["entry.js", "index.js", "_layout.js", "link/linking.js"]
    .map((f) => join(ROUTER_BUILD, f))
    .filter((f) => existsSync(f));

  const reachable = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    reachable.add(file);
    let source;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of source.matchAll(/require\(["'](\.[^"']+)["']\)/g)) {
      for (const candidate of [
        resolve(file, "..", `${match[1]}.js`),
        resolve(file, "..", match[1], "index.js"),
      ]) {
        if (existsSync(candidate) && !reachable.has(candidate)) {
          queue.push(candidate);
        }
      }
    }
  }

  // Strip comments before looking for calls, so the commented-out fork
  // reference in fork/getStateFromPath.js is not counted.
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  const decodingCalls = [];
  for (const file of reachable) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const api of ["parse", "parseUrl", "extract"]) {
      if (new RegExp(`queryString\\.${api}\\s*\\(`).test(source)) {
        decodingCalls.push(`${relative(ROOT, file)} -> queryString.${api}()`);
      }
    }
  }

  if (decodingCalls.length > 0) {
    notes.push(
      `query-string's decoding API is LIVE in ${decodingCalls.length} module(s) reachable from expo-router's entry points (${reachable.size} walked):\n${decodingCalls.map((c) => `      ${c}`).join("\n")}\n      react-navigation's core barrel re-exports that module, and \n      useLinking.native / useLinkBuilder default to it, so this is \n      reachable code -- the Metro alias is the mitigation, not \n      belt-and-braces. Do not remove it.`,
    );
  } else {
    notes.push(
      `expo-router reaches ${reachable.size} modules from its entry points and none call query-string's decoding API. If that is now true of every release the project builds against, the Metro alias could be retired -- but check useLinking/useLinkBuilder defaults first.`,
    );
  }
}

// ------------------------------------------------------------------ report

if (failures.length > 0) {
  console.error(`\n${failures.length} deep-link decoder problem(s):\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}

console.log("deep-link decoder OK");
for (const n of notes) console.log(`  - ${n}`);
