import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { keysetOlderThan } from "@abonten/core/pagination";
import type {
  BookingStatus,
  CustomerPlaceBooking,
} from "@abonten/types/placeBookingType";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

// Consumer place-booking flow. The request goes through the shared
// @abonten/services core via POST /api/mobile/places/:id/bookings (so the
// owner notification can be written with the service-role client — see
// requestPlaceBookingCore); the "My bookings" list is a plain RLS-scoped
// read of `place_booking` (place_booking_customer_select); cancel goes back
// through the route (owner notification again).

const PAGE = 15;
type Cursor = { sortValue: string; id: string } | null;

export function useRequestBooking(placeId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      serviceId?: string | null;
      requestedTime: string;
      partySize?: number | null;
      note?: string | null;
    }) => {
      if (!placeId) throw new Error("Missing place");
      return api.places.requestBooking(placeId, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mobile", "my-bookings"] });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { placeId: string; bookingId: string }) =>
      api.places.cancelBooking(input.placeId, input.bookingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mobile", "my-bookings"] });
    },
  });
}

export type MyBooking = CustomerPlaceBooking & {
  place_service?: { name: string } | null;
};

export function useMyBookings(filter?: BookingStatus | "all") {
  const { session } = useSession();
  const userId = session?.user.id;

  return useInfiniteQuery({
    queryKey: ["mobile", "my-bookings", userId, filter ?? "all"],
    enabled: !!userId,
    initialPageParam: null as Cursor,
    getNextPageParam: (last: { nextCursor: Cursor }) => last.nextCursor,
    queryFn: async ({ pageParam }) => {
      let q = supabase
        .from("place_booking")
        .select("*, place:place_id(name, slug), place_service:service_id(name)")
        .eq("customer_id", userId ?? "")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE + 1);
      if (filter && filter !== "all") q = q.eq("status", filter);
      if (pageParam) q = q.or(keysetOlderThan("created_at", "id", pageParam));

      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as MyBooking[];
      const hasNext = rows.length > PAGE;
      const page = hasNext ? rows.slice(0, PAGE) : rows;
      const lastRow = page[page.length - 1];
      return {
        rows: page,
        nextCursor:
          hasNext && lastRow
            ? { sortValue: lastRow.created_at, id: lastRow.id }
            : null,
      };
    },
  });
}
