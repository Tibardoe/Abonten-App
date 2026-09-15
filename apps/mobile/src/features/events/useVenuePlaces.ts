import { useSession } from "@/auth/SessionProvider";
import type { VenuePlace } from "@/features/events/useEventWizard";
import { useIsPlaceOwner } from "@/features/roles/useRoles";
import { supabase } from "@/lib/supabase";
import { parseWKBHex } from "@abonten/core/parseWKBHex";
import { useQuery } from "@tanstack/react-query";

// The signed-in organizer's own published places, shaped for the event
// wizard's venue picker (id / name / address / coordinates). A direct
// RLS-scoped read of `place` (owner sees their own rows), keyed on the user
// so a sign-out can never surface someone else's places.

type Row = {
  id: string;
  name: string;
  address: { full_address?: string } | null;
  location: string | null;
};

export function useVenuePlaces(force = false): VenuePlace[] {
  const { session } = useSession();
  const isPlaceOwner = useIsPlaceOwner();
  const userId = session?.user.id;
  const q = useQuery({
    queryKey: ["mobile", "organizer", "venue-places", userId],
    enabled: !!userId && (isPlaceOwner || force),
    staleTime: 60_000,
    queryFn: async (): Promise<VenuePlace[]> => {
      const { data, error } = await supabase
        .from("place")
        .select("id, name, address, location")
        .eq("owner_id", userId as string)
        .eq("status", "published")
        .order("name", { ascending: true })
        .limit(50);
      if (error) throw error;
      const out: VenuePlace[] = [];
      for (const row of (data ?? []) as Row[]) {
        if (!row.location) continue;
        try {
          const { eventLat, eventLng } = parseWKBHex(row.location);
          if (!Number.isFinite(eventLat) || !Number.isFinite(eventLng))
            continue;
          out.push({
            id: row.id,
            name: row.name,
            address: row.address?.full_address ?? row.name,
            lat: eventLat,
            lng: eventLng,
          });
        } catch {
          // A row without a parsable point can't be a venue.
        }
      }
      return out;
    },
  });
  return q.data ?? [];
}
