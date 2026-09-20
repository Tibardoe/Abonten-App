// Dynamic Expo config. The static app.json holds everything; this file only
// layers in the Google Maps API key from the environment
// (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) so the key never lives in a tracked
// file. Local `expo` reads it from apps/mobile/.env; EAS Build/Update must
// have EXPO_PUBLIC_GOOGLE_MAPS_API_KEY set in the project's EAS environment
// variables (dev / preview / production), same as the Supabase vars.
//
// The key is Android-only on purpose. iOS renders every map with Apple Maps
// (each <MapView> passes PROVIDER_GOOGLE only on Android), so it needs no
// Google SDK. Setting `ios.config.googleMapsApiKey` would also switch on
// Expo's built-in Maps plugin, which adds `pod 'react-native-google-maps'` —
// a pod react-native-maps 1.x no longer ships — and fails `pod install`.
// Expo reads app.json first and hands the result in as `config`. Take it
// from there rather than re-reading the file: that is the documented
// contract, it is what `expo-doctor` checks for, and it keeps anything Expo
// merges in on the way through (an `expo` key from app.config defaults, EAS
// injected values) instead of silently dropping it.
module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  return {
    ...config,
    updates: {
      ...config.updates,
      url: "https://u.expo.dev/c0a45056-182f-47c5-b862-de14034a830a",
    },
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        ...(googleMapsApiKey
          ? { googleMaps: { apiKey: googleMapsApiKey } }
          : {}),
      },
    },
  };
};
