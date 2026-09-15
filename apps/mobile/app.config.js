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
const base = require("./app.json").expo;

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

module.exports = {
  ...base,
  updates: {
    ...base.updates,
    url: "https://u.expo.dev/c0a45056-182f-47c5-b862-de14034a830a",
  },
  android: {
    ...base.android,
    config: {
      ...base.android?.config,
      ...(googleMapsApiKey
        ? { googleMaps: { apiKey: googleMapsApiKey } }
        : {}),
    },
  },
};
