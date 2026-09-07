import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

// eslint-config-next v16 ships native flat configs — consume them directly.
// The previous FlatCompat wrapper (from @eslint/eslintrc) is not compatible
// with the v16 shareable configs and made ESLint crash outright
// ("Converting circular structure to JSON"), so `npm run lint:next` never
// ran. Biome stays the primary/enforced linter; this is the secondary pass.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    // Pin the React version explicitly. eslint-plugin-react's auto-detect
    // path calls context.getFilename(), which ESLint 10 removed — leaving it
    // on "detect" throws before any file is linted.
    settings: { react: { version: "19" } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // New in the react-hooks plugin bundled with eslint-config-next v16.
      // They flag patterns this codebase uses deliberately (a ref holding
      // the latest callback; syncing an external store into state from an
      // effect). Biome is the enforced linter — keep these visible as
      // warnings rather than failing the secondary pass on pre-existing code.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      // ESLint has never actually run against this codebase before (the old
      // `next lint` + FlatCompat setup crashed), so there is a pre-existing
      // backlog under these rules. Demote them to warnings so `lint:next` is
      // usable as a signal now, and clear the backlog separately. New `any`
      // is still caught by Biome + code review.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
