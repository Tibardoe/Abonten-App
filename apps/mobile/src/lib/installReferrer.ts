import { requireOptionalNativeModule } from "expo-modules-core";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// The Google Play install referrer: the `referrer` of the Play Store link
// this install came from (a friend's invite, ref=CODE; a listing's "Get the
// app", open=<path>&src=<code>). Android only. Google Play keeps it for 90
// days after the install, so it can be asked for again; each reader keeps
// its own once-per-install flag (firstTimeOnThisInstall), and one run of
// the app asks the store at most once, whoever reads first.

let reading: Promise<string | null> | null = null;

/**
 * Whether this phone can have a referrer: Android, with the native module
 * in the build (it is in current builds; the guard keeps an older binary
 * from crashing on the import).
 */
export function canReadInstallReferrer(): boolean {
  return (
    Platform.OS === "android" &&
    !!requireOptionalNativeModule("ExpoApplication")
  );
}

/** The referrer string, or null (none, not Android, or no Play Store). */
export function getInstallReferrer(): Promise<string | null> {
  if (!reading) {
    reading = (async () => {
      if (!canReadInstallReferrer()) return null;
      try {
        const Application = await import("expo-application");
        return (await Application.getInstallReferrerAsync()) || null;
      } catch {
        // no Play Store (emulator / sideloaded build)
        return null;
      }
    })();
  }
  return reading;
}

/**
 * True the first time it is asked for `key` on this install, false after
 * that. False too when the device store cannot be read, so nothing that
 * depends on it can repeat.
 */
export async function firstTimeOnThisInstall(key: string): Promise<boolean> {
  try {
    if (await SecureStore.getItemAsync(key)) return false;
    await SecureStore.setItemAsync(key, "1");
    return true;
  } catch {
    return false;
  }
}
