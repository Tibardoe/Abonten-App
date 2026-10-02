#!/usr/bin/env node
// Two screens of the native app render with NO provider around them:
//
//   BrandedSplash       shown by app/_layout.tsx while the fonts load,
//                       before the provider stack is mounted;
//   RootErrorBoundary   mounted by the router AROUND the root layout, so
//                       when the layout fails its providers are gone.
//
// A hook that reads a provider (useTranslations, useTheme, useToast,
// useSession, useQuery…) throws there. In the splash that is a crash on
// every cold start; in the error screen it is a crash of the screen that
// reports crashes. Both have happened: useTheme once, and useTranslations
// when the app's strings were moved into the catalogs. Neither shows up in
// a type check, a lint run or a unit test, only on a device.
//
// This keeps those files to hooks that need no provider. Words come from
// translatorFor() (@abonten/ui-native/i18n), colours from constants.
//
//   node scripts/check-mobile-boot.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PROVIDERLESS = [
  "apps/mobile/src/components/BrandedSplash.tsx",
  "apps/mobile/src/components/RootErrorBoundary.tsx",
];

// Modules whose hooks work without a provider of ours. (expo-router's own
// context is still there for the error boundary: the router mounts it.)
const SAFE_HOOK_SOURCES = new Set(["react", "react-native", "expo-router"]);

const problems = [];

for (const relative of PROVIDERLESS) {
  const file = join(ROOT, relative);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const from = statement.moduleSpecifier.text;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const name = (element.propertyName ?? element.name).text;
      if (!/^use[A-Z]/.test(name)) continue;
      if (SAFE_HOOK_SOURCES.has(from)) continue;
      const { line } = source.getLineAndCharacterOfPosition(element.getStart());
      problems.push(
        `${relative}:${line + 1}  ${name} from "${from}" needs a provider this file is rendered without`,
      );
    }
  }
}

if (problems.length > 0) {
  console.log(
    "mobile boot: a screen that renders without providers uses a provider hook:",
  );
  for (const problem of problems) console.log(`  ${problem}`);
  console.log(
    '\nUse translatorFor("namespace") for words and constants for colours.',
  );
  process.exit(1);
}

console.log(
  `mobile boot: the ${PROVIDERLESS.length} screens that render without providers use none.`,
);
