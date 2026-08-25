"use client";

import { getEventAttendanceCount } from "@/actions/getAttendace";
import { getEventSoldOutStatus } from "@/utils/getEventSoldOutStatus";
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

/** Hero "🎉 N Attendees" + "Sold Out" badges. */
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
      <span className="px-3 py-1.5 md:px-4 md:py-2 bg-black/20 backdrop-blur-sm rounded-full text-white text-sm md:text-base">
        🎉 {attendanceCount} Attendees
      </span>
      {soldOut && (
        <span className="px-3 py-1.5 md:px-4 md:py-2 bg-red-600 rounded-full text-white font-bold text-sm md:text-base">
          Sold Out
        </span>
      )}
    </>
  );
}

/** Sidebar "Event Capacity" remaining/progress-bar card. */
export function EventCapacityCard({
  eventId,
  capacity,
  ticketTypes,
  initialCount,
}: EventAttendanceStatsProps) {
  const attendanceCount = useLiveAttendanceCount(eventId, initialCount);

  if (capacity == null || capacity <= 0) return null;

  return (
    <div className="bg-card text-card-foreground rounded-xl p-4 md:p-6 shadow-sm">
      <h3 className="text-lg font-medium mb-3 md:mb-4 text-card-foreground">
        Event Capacity
      </h3>
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Available</span>
          <span>{Math.max(capacity - attendanceCount, 0)} remaining</span>
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
