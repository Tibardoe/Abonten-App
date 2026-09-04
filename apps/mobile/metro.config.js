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

module.exports = withNativeWind(config, { input: "./global.css" });
