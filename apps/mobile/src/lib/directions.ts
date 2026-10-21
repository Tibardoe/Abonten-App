import { parseWKBHex } from "@abonten/core/parseWKBHex";
import * as SecureStore from "expo-secure-store";
import { Linking, Platform } from "react-native";

// Getting to an event or a place: the person picks the maps app (Apple Maps
// gives poor directions in Ghana, so iPhones need a choice too), or shares
// the location with a driver or a friend (DirectionsSheet).
//
// Every app is opened through its documented web link, which the phone hands
// to the app when it is installed: Google Maps URLs (google.com/maps/dir),
// Apple Maps (maps.apple.com) and Waze (waze.com/ul). Without the app,
// Google's link opens Google Maps in the browser, which still routes, and
// Waze's offers the store. Nothing here needs a native build: an app
// cannot ask which apps are installed without declaring their schemes in a
// new binary. Coordinates are used when the listing has them; an address
// alone can resolve to the wrong "Tafo".

export type Coords = { lat: number; lng: number };

export type DirectionsTarget = {
  label: string;
  address?: string | null;
  coords?: Coords | null;
};

export type MapsApp = "google" | "apple" | "waze";

/** The apps offered on this phone, most useful in Ghana first. */
export function mapsAppsForPlatform(): MapsApp[] {
  return Platform.OS === "ios"
    ? ["google", "apple", "waze"]
    : ["google", "waze"];
}

/** A listing's stored point (a PostGIS geography as WKB hex), or null. */
export function coordsFromLocation(location: unknown): Coords | null {
  if (typeof location !== "string" || location.length === 0) return null;
  try {
    const { eventLat, eventLng } = parseWKBHex(location);
    return Number.isFinite(eventLat) && Number.isFinite(eventLng)
      ? { lat: eventLat, lng: eventLng }
      : null;
  } catch {
    return null;
  }
}

function destination({ label, address, coords }: DirectionsTarget): string {
  return coords
    ? `${coords.lat},${coords.lng}`
    : encodeURIComponent(address || label);
}

export function directionsUrl(app: MapsApp, target: DirectionsTarget): string {
  const dest = destination(target);
  switch (app) {
    case "google":
      return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
    case "apple":
      return `https://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(target.label)}`;
    case "waze":
      return target.coords
        ? `https://waze.com/ul?ll=${dest}&navigate=yes`
        : `https://waze.com/ul?q=${dest}&navigate=yes`;
  }
}

/** A pin anyone can open, for sharing: Google Maps reads it everywhere. */
export function locationLink(target: DirectionsTarget): string {
  return `https://www.google.com/maps/search/?api=1&query=${destination(target)}`;
}

/** The words "Share location" sends with the pin: the name, the address. */
export function locationShareTitle(target: DirectionsTarget): string {
  return [target.label, target.address]
    .filter((line): line is string => !!line && line.trim().length > 0)
    .join("\n");
}

/** Resolves false when neither the app nor the Google Maps page opened. */
export async function openDirectionsIn(
  app: MapsApp,
  target: DirectionsTarget,
): Promise<boolean> {
  try {
    await Linking.openURL(directionsUrl(app, target));
    return true;
  } catch {
    try {
      await Linking.openURL(directionsUrl("google", target));
      return true;
    } catch {
      return false;
    }
  }
}

// The app last picked goes to the top of the list next time. Per device,
// not per account: it is about which apps this phone has.
const LAST_APP_KEY = "abonten.directions.last-app";

export async function readLastMapsApp(): Promise<MapsApp | null> {
  try {
    const value = await SecureStore.getItemAsync(LAST_APP_KEY);
    return value === "google" || value === "apple" || value === "waze"
      ? value
      : null;
  } catch {
    return null;
  }
}

export async function rememberMapsApp(app: MapsApp): Promise<void> {
  try {
    await SecureStore.setItemAsync(LAST_APP_KEY, app);
  } catch {
    // Only the order of the list depends on it.
  }
}
