const fs = require("node:fs");
const path = require("node:path");
const {
  withDangerousMod,
  withGradleProperties,
} = require("@expo/config-plugins");

// Turn R8 on for Android release builds, and keep the classes it cannot see.
//
// `android.enableMinifyInReleaseBuilds` and the resource-shrinking flag both
// default to FALSE in the Expo template, so release builds shipped every
// class and resource the dependency graph could reach. Measured on a release
// APK built from this project: 64.9 MB of 151 MB was dex — and dex does not
// split by ABI, so every Play install carried all of it whatever phone it
// landed on. With R8 on that becomes 23.8 MB: 41 MB off every install.
//
// This lives in a config plugin rather than in android/gradle.properties
// because `apps/mobile/android` is generated and gitignored — an edit there
// is wiped by the next prebuild and never reaches an EAS build.
//
// R8 finds reflective code through consumer rules the libraries ship.
// react-native-maps, expo-camera and @sentry/react-native ship none, so they
// are kept here by name, along with the Expo module registry, which is
// discovered by name at runtime.
//
// Verified on an emulator against the production API with a minified release
// APK: email OTP sign-in, Supabase session restore from SecureStore,
// push-token registration, the organizer attendee list, expo-camera plus the
// ML Kit barcode scanner opening a live preview, the messages inbox with
// remote avatars, the Abonten Weekly banner, explore and navigation — no
// FATAL EXCEPTION, ClassNotFoundException, NoSuchMethodError,
// NoClassDefFoundError or VerifyError anywhere in it.
//
// NOT verified: the map view. The Google Maps key is injected into the
// manifest at EAS build time, so a local release build never mounts a
// MapView (the app degrades to its own notice instead). Check the map on an
// EAS preview build before shipping to Play.

const MARKER = "# >>> abonten-android-minification";

const KEEP_RULES = `
${MARKER} (plugins/withAndroidMinification.js)
# react-native-maps (com.rnmaps.*) and the Google Maps SDK it drives.
-keep class com.rnmaps.** { *; }
-keep class com.google.android.gms.maps.** { *; }
-keep interface com.google.android.gms.maps.** { *; }
-dontwarn com.google.android.gms.maps.**

# expo-camera + ML Kit barcode scanning — the ticket QR scanner at the gate.
-keep class expo.modules.camera.** { *; }
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.internal.mlkit_vision_barcode.** { *; }
-dontwarn com.google.mlkit.**

# Sentry's React Native bridge, so a crash still symbolicates.
-keep class io.sentry.react.** { *; }
-keep class io.sentry.android.** { *; }
-dontwarn io.sentry.**

# Expo modules are discovered reflectively from the generated module list.
-keep class expo.modules.** { *; }
-keep class * implements expo.modules.core.interfaces.Package { *; }
# <<< abonten-android-minification
`;

/** Set a gradle.properties key, replacing any existing entry for it. */
function setProperty(properties, key, value) {
  const existing = properties.find(
    (item) => item.type === "property" && item.key === key,
  );
  if (existing) {
    existing.value = value;
    return properties;
  }
  properties.push({ type: "property", key, value });
  return properties;
}

const withAndroidMinification = (config) => {
  config = withGradleProperties(config, (cfg) => {
    setProperty(cfg.modResults, "android.enableMinifyInReleaseBuilds", "true");
    setProperty(
      cfg.modResults,
      "android.enableShrinkResourcesInReleaseBuilds",
      "true",
    );
    // R8 needs noticeably more heap than an unminified build: at the template
    // default of 2048m the daemon died partway through minification with
    // "the JVM garbage collector is thrashing".
    setProperty(
      cfg.modResults,
      "org.gradle.jvmargs",
      "-Xmx4096m -XX:MaxMetaspaceSize=1024m",
    );
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const file = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro",
      );
      const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (!current.includes(MARKER)) {
        fs.writeFileSync(file, `${current.trimEnd()}\n${KEEP_RULES}`, "utf8");
      }
      return cfg;
    },
  ]);

  return config;
};

module.exports = withAndroidMinification;
