import {
  type EventSubscription,
  requireOptionalNativeModule,
} from "expo-modules-core";

export type VolumeChange = { volume: number; direction: "up" | "down" };

type VolumeObserverNative = {
  getVolume(): number;
  addListener(
    event: "onVolumeChange",
    listener: (e: VolumeChange) => void,
  ): EventSubscription;
};

// Optional: an app binary built before this module existed (an older dev
// client, an OTA update onto an old store build) simply has no volume
// events — callers get `null` and keep the on-screen sound button only.
const native =
  requireOptionalNativeModule<VolumeObserverNative>("VolumeObserver");

export const VOLUME_OBSERVER_AVAILABLE = native != null;

export function addVolumeListener(
  listener: (e: VolumeChange) => void,
): EventSubscription | null {
  return native ? native.addListener("onVolumeChange", listener) : null;
}
