"use client";

import getAttendanceList from "@/actions/getAttendanceList";
import { useTranslations } from "next-intl";
import AttendanceListView from "./AttendanceListView";

/**
 * A team member's attendee list (Managers): the people coming and their
 * check-in, without the money of the Insights tab, which stays with Owners
 * and Finance.
 */
export default function ManageEventAttendeesSection({
  eventId,
}: {
  eventId: string;
}) {
  const t = useTranslations("events");

  async function fetchPage(cursor: string | null) {
    return getAttendanceList(eventId, { cursor });
  }

  return (
    <AttendanceListView
      queryKey={["attendance-list", eventId]}
      initialPage={null}
      fetchPage={fetchPage}
      emptyState={<p className="text-sm text-muted-foreground">{t("none")}</p>}
    />
  );
}
