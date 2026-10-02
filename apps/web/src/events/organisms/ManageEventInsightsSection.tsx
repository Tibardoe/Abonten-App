"use client";

import getAttendanceList from "@/actions/getAttendanceList";
import EventAnalyticsDashboard from "@/components/organisms/EventAnalyticsDashboard";
import { actionUnreachable } from "@/utils/actionUnreachable";
import { useTranslations } from "next-intl";
import AttendanceListView from "./AttendanceListView";

/**
 * Insights tab of the Unified Event Management page — the sole place
 * attendance/check-in functionality lives (EventAnalyticsDashboard + the
 * attendee list). There is no separate /manage/attendance route anymore.
 */
export default function ManageEventInsightsSection({
  eventId,
}: {
  eventId: string;
}) {
  const t = useTranslations("events");

  async function fetchPage(cursor: string | null) {
    return getAttendanceList(eventId, { cursor });
  }

  return (
    <div className="flex flex-col gap-8">
      <EventAnalyticsDashboard eventId={eventId} />

      <div>
        <h2 className="font-bold md:text-lg mb-3">{t("attendees")}</h2>

        <AttendanceListView
          queryKey={["attendance-list", eventId]}
          initialPage={null}
          fetchPage={fetchPage}
          emptyState={
            <p className="text-sm text-muted-foreground">{t("none")}</p>
          }
        />
      </div>
    </div>
  );
}
