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

module.exports = withNativeWind(config, { input: "./global.css" });
