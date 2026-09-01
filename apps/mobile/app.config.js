// Dynamic Expo config. The static app.json holds everything; this file only
// layers in the Google Maps API key from the environment
// (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) so the key never lives in a tracked
// file. Local `expo` reads it from apps/mobile/.env; EAS Build/Update must
// have EXPO_PUBLIC_GOOGLE_MAPS_API_KEY set in the project's EAS environment
// variables (dev / preview / production), same as the Supabase vars.
const base = require("./app.json").expo;

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

module.exports = {
  ...base,
  android: {
    ...base.android,
    config: {
      ...base.android?.config,
      ...(googleMapsApiKey
        ? { googleMaps: { apiKey: googleMapsApiKey } }
        : {}),
    },
  },
  ios: {
    ...base.ios,
    ...(googleMapsApiKey ? { config: { ...base.ios?.config, googleMapsApiKey } } : {}),
  },
};
