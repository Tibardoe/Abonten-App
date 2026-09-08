import { requireOptionalNativeModule } from "expo-modules-core";

// `expo-audio`'s JS entry calls `requireNativeModule('ExpoAudio')` at import
// time, which THROWS in a prebuild/bare app that hasn't been rebuilt since
// the package was added — and that throw cascades up to the route module,
// crashing the whole conversation screen with
// "Cannot read property 'ErrorBoundary' of undefined".
//
// So nothing in the synchronous chat route graph may `import "expo-audio"`.
// This flag (which only touches expo-modules-core, always linked) gates the
// voice UI: when false, the recorder button is hidden and incoming voice
// notes show a "update the app to play" chip; the rest of chat works. After
// an `expo run:android` / EAS rebuild the native module links and voice
// activates. The voice hooks/components are only ever loaded via
// `React.lazy` once this is true.
export const VOICE_SUPPORTED = requireOptionalNativeModule("ExpoAudio") != null;
