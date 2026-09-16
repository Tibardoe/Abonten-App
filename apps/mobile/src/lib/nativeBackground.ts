import { requireOptionalNativeModule } from "expo-modules-core";

// Paint the native root (iOS window + root view controller, Android decor
// view) with the app's theme background — see RootNavigator in
// app/_layout.tsx for why.
//
// expo-system-ui's own entry point calls `requireNativeModule`, which THROWS
// at import in a binary built before the module was added — and this JS can
// reach such binaries through an over-the-air update (same runtime version).
// So probe for the native module first and only then load the package; on
// an older build this is a silent no-op until the next native release.
export function setNativeRootBackground(color: string): void {
  if (!requireOptionalNativeModule("ExpoSystemUI")) return;
  const SystemUI = require("expo-system-ui") as typeof import("expo-system-ui");
  SystemUI.setBackgroundColorAsync(color).catch(() => {});
}
