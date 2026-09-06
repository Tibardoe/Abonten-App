const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

// Silences the `E/ExpoVideo: Current activity does not support
// picture-in-picture` error that expo-video (~57) logs every time a
// <VideoView> mounts or unmounts (highlight composer, highlight viewer).
//
// Why it happens: on view register/unregister, expo-video's
// PictureInPictureManager.findAndSetupPipCandidate() calls
// Activity.setPictureInPictureParams() to keep PiP params fresh — it does
// this UNCONDITIONALLY, even when no VideoView opted into PiP. The device
// reports the picture-in-picture *feature* as available, but if the main
// activity's manifest entry doesn't carry android:supportsPictureInPicture
// the call throws IllegalStateException. expo-video catches it and just
// logs the error above (see runWithPiPMisconfigurationSoftHandling).
//
// Declaring the attribute makes that otherwise no-op call succeed, so the
// log stops. It does NOT make the app enter PiP — that still needs a
// VideoView with allowsPictureInPicture / startsPictureInPictureAutomatically
// and we set neither anywhere.
//
// We deliberately do NOT use expo-video's own `supportsPictureInPicture`
// plugin option: it also forces the `audio` UIBackgroundMode into the iOS
// Info.plist (background-audio capability we don't want and would have to
// justify in App Store review). This plugin touches the Android manifest
// only. Harmless no-op on iOS and on any build that already has the attr.
const withPictureInPictureManifest = (config) =>
  withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(
      cfg.modResults,
    );
    activity.$["android:supportsPictureInPicture"] = "true";
    return cfg;
  });

module.exports = withPictureInPictureManifest;
