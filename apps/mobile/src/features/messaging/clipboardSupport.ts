import { requireOptionalNativeModule } from "expo-modules-core";

// `expo-clipboard`'s JS entry calls `requireNativeModule('ExpoClipboard')` at
// import time, which THROWS in this prebuild app until it is rebuilt with the
// new native module — and that throw would cascade up and crash the whole
// conversation screen. So nothing in the synchronous chat route graph may
// `import "expo-clipboard"` directly. Same pattern as voiceSupport.ts.
//
// CLIPBOARD_SUPPORTED only touches expo-modules-core (always linked); when
// false the "Copy" action is hidden. After an `expo run:android` / EAS
// rebuild the module links and Copy activates.
export const CLIPBOARD_SUPPORTED =
  requireOptionalNativeModule("ExpoClipboard") != null;

type ClipboardModule = {
  setStringAsync: (text: string) => Promise<boolean>;
};

// Lazily pull in expo-clipboard only once we know the module is present, so
// the `require` never runs on an un-rebuilt binary.
export async function copyText(text: string): Promise<boolean> {
  if (!CLIPBOARD_SUPPORTED) return false;
  try {
    const clipboard = require("expo-clipboard") as ClipboardModule;
    await clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
