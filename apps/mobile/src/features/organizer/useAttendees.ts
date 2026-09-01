import { api } from "@/lib/api";
import type { AttendanceRow } from "@abonten/api-client";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

// The per-event attendee list + check-in — mirrors the web
// AttendanceListView in the Insights tab of manage/events/[eventId].
// `row.ticket?.status === "used"` means the ticket is checked in;
// checkInTicket(id, false) undoes a mis-tap.

const KEY = ["mobile", "organizer", "attendees"] as const;

export function useAttendees(eventId: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, eventId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.organizer.eventAttendees(eventId, {
        cursor: pageParam,
        pageSize: 20,
      }),
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
    enabled: !!eventId,
  });
}

export function flattenAttendees(
  pages: { data: AttendanceRow[] }[] | undefined,
): AttendanceRow[] {
  return pages?.flatMap((p) => p.data) ?? [];
}

export function useCheckInTicket(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { ticketId: string; checkedIn: boolean }) =>
      api.organizer.checkInTicket(v.ticketId, v.checkedIn),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...KEY, eventId] });
      qc.invalidateQueries({
        queryKey: ["mobile", "organizer", "event-insights", eventId],
      });
    },
  });
}
