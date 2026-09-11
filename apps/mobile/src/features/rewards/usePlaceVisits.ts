import { api } from "@/lib/api";
import type { PlaceVisitResult } from "@abonten/types/rewards";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as Location from "expo-location";

// Verified place visits (Rewards Phase 8). The owner's rotating check-in
// code, and checking in as a visitor. The code and the distance are checked
// on the server; the app only reports where the phone is.

/** The owner's check-in code, refreshed as each one expires (every 30 s). */
export function usePlaceVisitPanel(placeId: string, enabled = true) {
  return useQuery({
    queryKey: ["mobile", "rewards", "place-visit", placeId],
    enabled: enabled && !!placeId,
    queryFn: async () => {
      const res = await api.organizer.placeVisitCode(placeId);
      if (res.status !== 200 || !res.data) {
        throw new Error(res.message ?? "Couldn't load the check-in code");
      }
      return res.data;
    },
    refetchInterval: (query) => {
      const expiresAt = query.state.data?.expiresAt;
      if (!expiresAt) return false;
      return Math.max(Date.parse(expiresAt) - Date.now(), 0) + 500;
    },
  });
}

/** Pulls `{ slug, code }` out of a scanned check-in QR (…/places/<slug>?visit=CODE). */
export function parseVisitQr(
  raw: string,
): { slug: string; code: string } | null {
  try {
    const url = new URL(raw.trim());
    const parts = url.pathname.split("/").filter(Boolean);
    const code = url.searchParams.get("visit");
    if (parts[0] !== "places" || !parts[1] || !code) return null;
    return { slug: decodeURIComponent(parts[1]), code };
  } catch {
    return null;
  }
}

export type CheckInOutcome = {
  ok: boolean;
  message: string;
  result?: PlaceVisitResult;
};

/**
 * Asks for the phone's location once and checks the caller in. Never
 * throws for an expected problem: the outcome carries the message to show.
 */
export function useCheckIn() {
  return useMutation({
    mutationFn: async (input: {
      placeId?: string;
      placeSlug?: string;
      code: string;
    }): Promise<CheckInOutcome> => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return {
          ok: false,
          message:
            "Allow location for Abonten so we can confirm you're at the place.",
        };
      }
      let pos: Location.LocationObject;
      try {
        pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
      } catch {
        return {
          ok: false,
          message:
            "We couldn't get your location. Check that location is on and try again.",
        };
      }
      const res = await api.places.recordVisit({
        placeId: input.placeId ?? null,
        placeSlug: input.placeSlug ?? null,
        code: input.code,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy,
        mocked: pos.mocked === true,
      });
      return {
        ok: res.status === 200,
        message: res.message ?? "Couldn't check you in. Try again.",
        result: res.data,
      };
    },
  });
}
