// Metro configured for the npm-workspaces monorepo + NativeWind + Sentry.
// - watch the repo root so edits to packages/* hot-reload
// - also resolve modules from the hoisted root node_modules
// - getSentryExpoConfig (drop-in for getDefaultConfig) adds the source-map
//   / debug-id customizer the Sentry native build step needs
// See https://docs.expo.dev/guides/monorepos/
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getSentryExpoConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
// Resolve only through the two roots listed above, instead of also walking
// every node_modules directory between a file and the disk root.
//
// `expo-doctor` flags this one line ("expected false, got: true"), so here
// is the measurement behind keeping it. Exporting the Android bundle both
// ways, everything else equal:
//
//     disableHierarchicalLookup = true    10,224,011 bytes
//     disableHierarchicalLookup = false   11,075,409 bytes   (+851 KB)
//
// Hierarchical lookup finds the nested duplicate copies npm leaves under
// individual packages, so the same library gets bundled more than once.
// 851 KB is worth a doctor warning.
//
// An earlier version of this comment said the flag was needed because EAS
// Build's `expo export:embed` otherwise bundled the wrong entry. That is not
// true on SDK 57: Gradle resolves the entry through
// `expo/scripts/resolveAppEntry`, which reads package.json `main` and never
// loads this file. Keep the flag for the size, not for entry resolution.
config.resolver.disableHierarchicalLookup = true;

// `color@4.2.3` (pulled in by expo-router / react-navigation) does
// `require("color-string")` and needs the v1 CJS API. npm nests the right
// one at node_modules/color/node_modules/color-string@1.9.1, but
// disableHierarchicalLookup above stops Metro from finding a nested
// node_modules — so `require("color-string")` resolves to the HOISTED root
// copy, which is color-string@2.1.4 (ESM-only, pulled in by @react-pdf on
// the WEB side only). `color@4.2.3` then gets a module without `.get()` and
// throws "undefined is not a function" the moment anything renders a
// react-navigation <Badge> (e.g. the Messages tab's unread count).
// The mobile bundle never legitimately needs color-string@2, so pin every
// `color-string` request to the v1 copy.
const colorStringV1Entry = path.join(
  monorepoRoot,
  "node_modules",
  "color",
  "node_modules",
  "color-string",
  "index.js",
);
if (!require("node:fs").existsSync(colorStringV1Entry)) {
  throw new Error(
    `metro.config.js: expected color-string v1 at ${colorStringV1Entry} — did the dep tree change? Re-check the color / color-string pin.`,
  );
}
// `expo-router` -> `query-string@7` -> `decode-uri-component@0.2.2`, which
// carries GHSA-vcc3-ghjq-m6fr: its fallback decoder bisects and re-decodes
// the token list of any malformed percent-encoded input, so a crafted deep
// link can pin the JS thread. There is no version to upgrade to — the first
// patched release is ESM-only while query-string reaches it through
// `require()`, and even `expo-router@58` still declares `query-string: ^7`.
// An npm override would therefore replace a hang with a TypeError while
// making `npm audit` look clean, so the bundled copy is swapped here
// instead. `vendor/decode-uri-component.js` is a drop-in with the same
// behaviour and a single linear pass; `npm run check:deep-link-decoder`
// differentially tests the two and fails the build if they ever diverge.
const safeDecodeUriComponent = path.join(
  projectRoot,
  "vendor",
  "decode-uri-component.js",
);
if (!require("node:fs").existsSync(safeDecodeUriComponent)) {
  throw new Error(
    `metro.config.js: expected the safe decoder at ${safeDecodeUriComponent} — restore it, or the app bundles the vulnerable decode-uri-component again.`,
  );
}

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "color-string") {
    return { type: "sourceFile", filePath: colorStringV1Entry };
  }
  if (moduleName === "decode-uri-component") {
    return { type: "sourceFile", filePath: safeDecodeUriComponent };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = withNativeWind(config, { input: "./global.css" });
