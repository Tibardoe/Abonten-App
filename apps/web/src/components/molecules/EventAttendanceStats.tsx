"use client";

import { getEventAttendanceCount } from "@/actions/getAttendace";
import { getEventSoldOutStatus } from "@abonten/core/getEventSoldOutStatus";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type TicketTypeQuantity = {
  quantity: number | null;
};

type AttendanceCountResult = Awaited<
  ReturnType<typeof getEventAttendanceCount>
>;

function hasAttendanceCount(
  value: AttendanceCountResult | undefined,
): value is { status: 200; count: number } {
  return !!value && value.status === 200 && "count" in value;
}

type EventAttendanceStatsProps = {
  eventId: string;
  capacity: number | null;
  ticketTypes: TicketTypeQuantity[];
  initialCount: number;
};

/**
 * Shared live-count hook backing both pieces below. Both subscribe to the
 * exact same ["attendance-count", eventId] query AttendingButton.tsx already
 * owns and invalidates on every free-RSVP mutation — React Query dedupes by
 * key, so mounting it twice on one page costs no extra request. `initialData`
 * is the SSR-computed count, so this renders identically to the old static
 * markup until (if ever) a mutation elsewhere changes it.
 */
function useLiveAttendanceCount(eventId: string, initialCount: number) {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["attendance-count", eventId],
    queryFn: () => getEventAttendanceCount(eventId),
    initialData: () =>
      queryClient.getQueryData<AttendanceCountResult>([
        "attendance-count",
        eventId,
      ]),
  });

  return hasAttendanceCount(data) ? data.count : initialCount;
}

/** Hero "N going" + "Sold out" badges. The count shows once someone is
 * going: "0 going" on a new event reads as a warning, not information. */
export function EventAttendanceHeroBadges({
  eventId,
  capacity,
  ticketTypes,
  initialCount,
}: EventAttendanceStatsProps) {
  const attendanceCount = useLiveAttendanceCount(eventId, initialCount);
  const soldOut = getEventSoldOutStatus({
    capacity,
    attendeeCount: attendanceCount,
    ticketTypes,
  });

  return (
    <>
      {attendanceCount > 0 && (
        <span className="px-3 py-1.5 md:px-4 md:py-2 bg-black/30 backdrop-blur-sm rounded-full text-white text-sm md:text-base">
          {attendanceCount} going
        </span>
      )}
      {soldOut && (
        <span className="px-3 py-1.5 md:px-4 md:py-2 bg-destructive rounded-full text-destructive-foreground font-bold text-sm md:text-base">
          Sold out
        </span>
      )}
    </>
  );
}

/** "N spots left" + progress bar, drawn inside the ticket panel. */
export function EventCapacityCard({
  eventId,
  capacity,
  ticketTypes,
  initialCount,
}: EventAttendanceStatsProps) {
  const attendanceCount = useLiveAttendanceCount(eventId, initialCount);

  if (capacity == null || capacity <= 0) return null;

  return (
    <div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Capacity {capacity}</span>
          <span>{Math.max(capacity - attendanceCount, 0)} spots left</span>
        </div>
        <div className="relative pt-1">
          <div className="overflow-hidden h-2 bg-muted rounded-full">
            <div
              className="h-2 bg-primary rounded-full transition-all duration-500"
              style={{
                width: `${Math.min((attendanceCount / capacity) * 100, 100)}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
