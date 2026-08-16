import getAttendanceList from "@/actions/getAttendanceList";
import AttendanceListView from "./AttendanceListView";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = <p>None</p>;

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ eventId: string }>;
}) {
  const { eventId } = await searchParams;

  const firstPage = await getAttendanceList(eventId);

  async function fetchPage(cursor: string | null) {
    "use server";
    return getAttendanceList(eventId, { cursor });
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-bold md:text-xl">List of Attendance</h1>

      <AttendanceListView
        queryKey={["attendance-list", eventId]}
        initialPage={firstPage}
        fetchPage={fetchPage}
        emptyState={emptyState}
      />
    </div>
  );
}
