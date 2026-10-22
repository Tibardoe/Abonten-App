import type * as KeepAwake from "expo-keep-awake";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect } from "react";

// Keeps the screen on while an alert is open on the Safety screen, so the
// app stays in front and keeps sending positions. expo-keep-awake ships
// inside `expo` itself and is linked in every 1.0.0 build; the guard is
// there anyway, because an update that loads a missing native module
// crashes on start (2026-10-04). The type import above loads nothing.

const KEEP_AWAKE_AVAILABLE =
  requireOptionalNativeModule("ExpoKeepAwake") != null;
const TAG = "abonten-safety";

export function useSafetyKeepAwake(active: boolean): void {
  useEffect(() => {
    if (!active || !KEEP_AWAKE_AVAILABLE) return;
    const keepAwake = require("expo-keep-awake") as typeof KeepAwake;
    void keepAwake.activateKeepAwakeAsync(TAG).catch(() => {});
    return () => {
      void keepAwake.deactivateKeepAwake(TAG).catch(() => {});
    };
  }, [active]);
}
