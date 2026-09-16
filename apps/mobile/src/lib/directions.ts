import { Linking, Platform } from "react-native";

// Hand a destination to the phone's own maps app for directions.
//
// iOS opens Apple Maps (always installed; its URL scheme is the documented
// maps.apple.com one, which also routes to Google Maps if the person made
// that their default). Android fires a `geo:` intent, so the system chooser
// offers whichever navigation apps are installed. Coordinates are used when
// the listing has them — an address string alone can resolve to the wrong
// "Tafo" — and the Google Maps web search is the fallback everywhere.

export type DirectionsTarget = {
  label: string;
  address?: string | null;
  coords?: { lat: number; lng: number } | null;
};

function webUrl({ label, address, coords }: DirectionsTarget): string {
  const query = coords
    ? `${coords.lat},${coords.lng}`
    : encodeURIComponent(address || label);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function nativeUrl({ label, address, coords }: DirectionsTarget): string {
  if (Platform.OS === "ios") {
    const dest = coords
      ? `${coords.lat},${coords.lng}`
      : encodeURIComponent(address || label);
    return `https://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(label)}`;
  }
  if (coords) {
    return `geo:${coords.lat},${coords.lng}?q=${coords.lat},${coords.lng}(${encodeURIComponent(label)})`;
  }
  return `geo:0,0?q=${encodeURIComponent(address || label)}`;
}

/** Resolves false when neither the maps app nor the web fallback opened. */
export async function openDirections(
  target: DirectionsTarget,
): Promise<boolean> {
  try {
    await Linking.openURL(nativeUrl(target));
    return true;
  } catch {
    try {
      await Linking.openURL(webUrl(target));
      return true;
    } catch {
      return false;
    }
  }
}
