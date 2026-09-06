const {
  withProjectBuildGradle,
  withAppBuildGradle,
} = require("@expo/config-plugins");

// Android native-build fix — needed only for local Windows builds whose SDK
// path contains a space (e.g. C:\Users\First Last\...); a harmless no-op on
// macOS/Linux and on EAS.
//
// The problem: with a spaced SDK path, CMake writes the NDK clang compiler
// into the generated ninja rules as its Windows 8.3 SHORT path
// (…\ndk\271~1.122\TOOLCH~1\llvm\prebuilt\WINDOW~1\bin\CLANG_~1.EXE) to
// avoid quoting the space. The NDK's android.toolchain.cmake always injects
// `-no-canonical-prefixes`, which tells the clang driver NOT to realpath()
// its own argv[0]. With the un-canonicalised short path the driver's
// "is this an NDK toolchain? -> add -lc++" heuristic fails, so libc++
// (a.k.a. libc++_shared: libc++ + libc++abi + libunwind) is silently
// dropped from every native shared-library link. Every C++ runtime symbol
// (operator new/delete, __cxa_*, std::__ndk1::*, std::terminate,
// __gxx_personality_v0) then goes undefined, and the NDK's
// `-Wl,--no-undefined -Wl,--fatal-warnings` turns that into a hard failure
// for :expo-updates:buildCMakeDebug, :react-native-screens:buildCMakeDebug,
// react-native-worklets, and the app's own :app:buildCMakeDebug (which
// links appmodules + the react_codegen_* .so files). crtbegin/builtins/
// unwind survive because they resolve via --sysroot, a long path.
//
// The fix: append `-canonical-prefixes` (clang's own default) at link time
// via CMAKE_SHARED_LINKER_FLAGS. The last `-*canonical-prefixes` wins, so
// the driver realpath()s the short compiler path, the NDK heuristic fires
// again, and `-lc++` comes back. Verified with `clang++ -### ...`. On a
// space-free path / Linux there is no short path, so this changes nothing.
//
// Two injection points are needed because the app module and the library
// modules are configured through different Gradle paths:
//
//   1. build.gradle (root) — a `subprojects {}` block that reaches every
//      `com.android.library` native module (expo-updates, screens, worklets,
//      reanimated, …). This also pins each module to the single NDK the
//      Expo root project selects (rootProject.ext.ndkVersion); without it
//      expo-updates falls back to the Android Gradle Plugin's older
//      baseline default and the tree builds modules against two NDKs.
//
//   2. app/build.gradle — the React Native Gradle plugin wires the app's
//      own CMake through ApplicationAndroidComponentsExtension.finalizeDsl,
//      reading defaultConfig.externalNativeBuild.cmake.arguments. The
//      root-level subprojects block does not land on :app before that
//      runs, so the same flag is appended here directly, in the exact list
//      finalizeDsl reads from and adds to.

const ROOT_MARKER = "// >>> abonten-android-native-build-fix";

const ROOT_BLOCK = `
${ROOT_MARKER} (plugins/withAndroidNativeBuildFix.js)
subprojects { childProject ->
  childProject.plugins.withId("com.android.library") { abontenApplyNativeBuildFix(childProject) }
  childProject.plugins.withId("com.android.application") { abontenApplyNativeBuildFix(childProject) }
}
void abontenApplyNativeBuildFix(Project targetProject) {
  targetProject.android {
    if (rootProject.ext.has("ndkVersion")) {
      ndkVersion rootProject.ext.ndkVersion
    }
    defaultConfig {
      externalNativeBuild {
        cmake {
          // Re-enable path canonicalisation for the linker driver so the
          // NDK clang adds -lc++ even when invoked via a Windows 8.3 short
          // path. No-op where the compiler path has no space.
          arguments += "-DCMAKE_SHARED_LINKER_FLAGS=-canonical-prefixes"
        }
      }
    }
  }
}
// <<< abonten-android-native-build-fix
`;

const APP_MARKER = "// >>> abonten-android-native-build-fix (app)";

const APP_BLOCK = `
${APP_MARKER} (plugins/withAndroidNativeBuildFix.js)
// See plugins/withAndroidNativeBuildFix.js — restores -lc++ for the app's
// own CMake build (appmodules + react_codegen_*) when the NDK clang is
// invoked via a Windows 8.3 short path. No-op on a space-free path / EAS.
android {
  defaultConfig {
    externalNativeBuild {
      cmake {
        arguments "-DCMAKE_SHARED_LINKER_FLAGS=-canonical-prefixes"
      }
    }
  }
}
// <<< abonten-android-native-build-fix (app)
`;

/** @type {import('@expo/config-plugins').ConfigPlugin} */
const withAndroidNativeBuildFix = (config) => {
  let next = withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        `withAndroidNativeBuildFix: expected android/build.gradle to be Groovy, got ${cfg.modResults.language}`,
      );
    }
    if (!cfg.modResults.contents.includes(ROOT_MARKER)) {
      cfg.modResults.contents = `${cfg.modResults.contents.trimEnd()}\n${ROOT_BLOCK}`;
    }
    return cfg;
  });

  next = withAppBuildGradle(next, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        `withAndroidNativeBuildFix: expected app/build.gradle to be Groovy, got ${cfg.modResults.language}`,
      );
    }
    if (!cfg.modResults.contents.includes(APP_MARKER)) {
      cfg.modResults.contents = `${cfg.modResults.contents.trimEnd()}\n${APP_BLOCK}`;
    }
    return cfg;
  });

  return next;
};

module.exports = withAndroidNativeBuildFix;
