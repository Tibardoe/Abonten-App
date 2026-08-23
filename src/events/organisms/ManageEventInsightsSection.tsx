"use client";

import getAttendanceList from "@/actions/getAttendanceList";
import AttendanceListView from "@/app/(pages)/manage/attendance/attendance-list/AttendanceListView";
import EventAnalyticsDashboard from "@/components/organisms/EventAnalyticsDashboard";

const emptyState = <p className="text-sm text-muted-foreground">None</p>;

/**
 * Insights tab of the Unified Event Management page — Part 13 of the spec
 * explicitly asks to reuse the existing event insights functionality rather
 * than rebuild it. This is literally the same content
 * /manage/attendance/attendance-list?eventId= already renders
 * (EventAnalyticsDashboard + the attendee list), just embedded as a tab
 * instead of a standalone route — no duplicate analytics implementation.
 */
export default function ManageEventInsightsSection({
  eventId,
}: {
  eventId: string;
}) {
  async function fetchPage(cursor: string | null) {
    return getAttendanceList(eventId, { cursor });
  }

  return (
    <div className="flex flex-col gap-8">
      <EventAnalyticsDashboard eventId={eventId} />

      <div>
        <h2 className="font-bold md:text-lg mb-3">Attendees</h2>

        <AttendanceListView
          queryKey={["attendance-list", eventId]}
          initialPage={null}
          fetchPage={fetchPage}
          emptyState={emptyState}
        />
      </div>
    </div>
  );
}
