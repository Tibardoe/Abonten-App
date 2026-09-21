import {
  requireNativeViewManager,
  requireOptionalNativeModule,
} from "expo-modules-core";
import type { ComponentType } from "react";
import { View, type ViewProps } from "react-native";

// A View whose area Android's edge Back gesture leaves to the app (see
// SystemGestureExclusionModule.kt). Anywhere the native module is missing —
// iOS, or an app binary built before it existed (an OTA update onto an older
// store build) — it is an ordinary View, so callers never need to check.
const available =
  requireOptionalNativeModule("SystemGestureExclusion") != null;

export const SystemGestureExclusionView: ComponentType<ViewProps> = available
  ? requireNativeViewManager<ViewProps>("SystemGestureExclusion")
  : View;
