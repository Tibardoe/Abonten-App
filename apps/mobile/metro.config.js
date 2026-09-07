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
// Without this, Metro's hierarchical module lookup can walk past this app's
// own resolution root in a way that's made explicit nodeModulesPaths above --
// this is Expo's own documented fix for monorepos where EAS Build's one-shot
// `expo export:embed` bundles the wrong entry (falls back to the default
// non-router node_modules/expo/AppEntry.js instead of "main": "expo-router/entry",
// even though the same package.json works fine under the long-running dev
// server). See https://docs.expo.dev/guides/monorepos/.
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
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "color-string") {
    return { type: "sourceFile", filePath: colorStringV1Entry };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(
    context,
    moduleName,
    platform,
  );
};

module.exports = withNativeWind(config, { input: "./global.css" });
