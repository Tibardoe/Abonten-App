#!/usr/bin/env node
// Adds the dependencies Biome's useExhaustiveDependencies rule reports as
// missing to the hook's dependency array. Used after a codemod puts `t`
// or `locale` inside useMemo/useCallback/useEffect bodies.
//
//   node scripts/i18n/fix-hook-deps.mjs apps/mobile/app apps/mobile/src

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const targets = process.argv.slice(2);

let report = "";
try {
  report = execFileSync(
    process.execPath,
    [
      join(ROOT, "node_modules/@biomejs/biome/bin/biome"),
      "lint",
      "--only=correctness/useExhaustiveDependencies",
      "--max-diagnostics=500",
      ...targets,
    ],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
} catch (error) {
  report = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}

// "path:line:col lint/correctness/useExhaustiveDependencies" followed by
// "This hook does not specify all of its dependencies: a, b".
const findings = new Map(); // file -> Map(line -> Set(names))
const lines = report.split(/\r?\n/);
for (let i = 0; i < lines.length; i++) {
  const head = lines[i].match(
    /^(.+?):(\d+):(\d+) lint\/correctness\/useExhaustiveDependencies/,
  );
  if (!head) continue;
  const file = head[1].replace(/\\/g, "/");
  const line = Number(head[2]);
  for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
    const m = lines[j].match(/does not specify all of its dependencies: (.+)$/);
    if (m) {
      const names = m[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const perFile = findings.get(file) ?? new Map();
      const set = perFile.get(line) ?? new Set();
      for (const n of names) set.add(n);
      perFile.set(line, set);
      findings.set(file, perFile);
      break;
    }
  }
}

let fixed = 0;
for (const [file, perFile] of findings) {
  const abs = join(ROOT, file);
  let src = readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(
    abs,
    src,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^use(Callback|Memo|Effect|LayoutEffect|ImperativeHandle)$/.test(
        node.expression.text,
      )
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const wanted = perFile.get(line);
      if (wanted) {
        const deps = node.arguments[node.arguments.length - 1];
        if (
          deps &&
          ts.isArrayLiteralExpression(deps) &&
          node.arguments.length >= 2
        ) {
          const present = new Set(deps.elements.map((e) => e.getText(sf)));
          const add = [...wanted].filter((n) => !present.has(n));
          if (add.length) {
            const insertAt = deps.elements.length
              ? deps.elements[deps.elements.length - 1].end
              : deps.getStart(sf) + 1;
            const text = deps.elements.length
              ? `, ${add.join(", ")}`
              : add.join(", ");
            edits.push({ at: insertAt, text });
            fixed++;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  edits.sort((a, b) => b.at - a.at);
  for (const e of edits) src = src.slice(0, e.at) + e.text + src.slice(e.at);
  if (edits.length) writeFileSync(abs, src);
}
console.log(
  `hook deps: ${fixed} dependency lists completed across ${findings.size} files`,
);
