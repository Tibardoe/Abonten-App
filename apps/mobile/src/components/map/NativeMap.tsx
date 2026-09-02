import { AppText } from "@abonten/ui-native";
import Constants from "expo-constants";
import { Component, type ReactNode } from "react";
import { Platform, View } from "react-native";

// react-native-maps ships native code that only exists once the app has been
// rebuilt (dev client / EAS build) with the module linked. On a stale binary
// the <MapView> render throws ("AIRMap was not found"). This boundary catches
// that so the screen degrades to a message + the list view instead of a red
// screen. Once the app is rebuilt the map renders normally.
//
// The Google Maps provider ALSO needs the API key baked into the native
// AndroidManifest / Info.plist at build time (app.config.js reads it from
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). If the installed binary was built
// without it, `<MapView provider={PROVIDER_GOOGLE}>` throws a *native*
// IllegalStateException ("API key not found") during view attach — which a
// JS error boundary CANNOT catch (it crashes the UI thread first). So the
// screens must not mount a MapView at all unless `MapConfigured` is true.

export class MapErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        this.props.fallback ?? (
          <View className="flex-1 items-center justify-center gap-2 bg-background p-8">
            <AppText variant="bodyStrong">Map needs the latest app</AppText>
            <AppText variant="muted" className="text-center">
              Update Abonten (or rebuild the dev client) to see the map view.
            </AppText>
          </View>
        )
      );
    }
    return this.props.children;
  }
}

// Re-export the pieces the map screens use. Importing the module lazily here
// keeps a single choke point; the boundary above handles the runtime case.
// biome-ignore lint/suspicious/noExplicitAny: react-native-maps has no types re-exported through this shim
let maps: any = null;
try {
  maps = require("react-native-maps");
} catch {
  maps = null;
}

export const MapView = maps?.default ?? null;
export const Marker = maps?.Marker ?? null;
export const PROVIDER_GOOGLE = maps?.PROVIDER_GOOGLE ?? undefined;
export const MapAvailable = maps != null;

// Is a Google Maps API key actually present in the config that produced
// this binary? `expoConfig` reflects the resolved app.config.js at build
// time, so a missing key here means the native manifest has no key and
// mounting a Google-provider MapView would hard-crash.
function readMapsApiKey(): string | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: expo-config typings don't surface the nested googleMaps block
  const cfg = Constants.expoConfig as any;
  if (Platform.OS === "android") {
    return cfg?.android?.config?.googleMaps?.apiKey;
  }
  return cfg?.ios?.config?.googleMapsApiKey;
}

export const MapConfigured = MapAvailable && !!readMapsApiKey();
