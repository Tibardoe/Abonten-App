#!/usr/bin/env node
// Guards the one accessibility rule on mobile that is easy to regress and
// impossible to see in review: a view you can press must tell a screen
// reader that it is a control.
//
// React Native's <Pressable> has no implicit role. Without
// accessibilityRole, TalkBack and VoiceOver announce only the child text —
// so "Buy ticket" reads as a label, not as a button, and the user is not
// told it can be activated. The app's own primitive
// (@abonten/ui-native PressableScale) defaults to "button"; this check
// covers the raw <Pressable>s that do not go through it.
//
// Exempt: a Pressable with no onPress of its own (a layout wrapper, a
// gesture host, a backdrop that only swallows taps) and anything explicitly
// marked accessible={false}, which is the correct way to hide decoration.
//
// Run: node scripts/check-mobile-a11y.mjs

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const ROOTS = ["apps/mobile/app", "apps/mobile/src", "packages/ui-native/src"];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".expo") continue;
      walk(full, out);
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** The text of a JSX opening tag, brace-aware so nested objects don't end it. */
function openingTag(source, from) {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    const c = source[i];
    if (c === "{") depth += 1;
    else if (c === "}") depth -= 1;
    else if (c === ">" && depth === 0) return source.slice(from, i);
  }
  return source.slice(from);
}

const offenders = [];

for (const base of ROOTS) {
  for (const file of walk(join(ROOT, base))) {
    const source = readFileSync(file, "utf8");
    const pattern = /<Pressable(?=[\s>])/g;
    let match = pattern.exec(source);
    while (match !== null) {
      const tag = openingTag(source, match.index + match[0].length);
      const pressable = /\bonPress\s*[=]/.test(tag);
      const labelled =
        /\baccessibilityRole\s*=/.test(tag) ||
        /\brole\s*=/.test(tag) ||
        /\baccessible\s*=\s*\{\s*false\s*\}/.test(tag);
      if (pressable && !labelled) {
        const line = source.slice(0, match.index).split("\n").length;
        offenders.push(`${relative(ROOT, file).replace(/\\/g, "/")}:${line}`);
      }
      match = pattern.exec(source);
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `\n${offenders.length} <Pressable> with an onPress and no accessibilityRole:\n`,
  );
  for (const o of offenders) console.error(`  ${o}`);
  console.error(
    '\nAdd accessibilityRole="button" (or the role that fits: "link", "tab",\n' +
      '"checkbox", "switch"), or use PressableScale from @abonten/ui-native,\n' +
      "which defaults to button. A wrapper that only swallows taps should say\n" +
      "accessible={false}.\n",
  );
  process.exit(1);
}

console.log("mobile accessibility OK — every pressable view announces a role.");
