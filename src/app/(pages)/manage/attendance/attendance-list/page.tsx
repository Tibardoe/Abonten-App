import getAttendanceList from "@/actions/getAttendanceList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  searchParams,
}: {
  searchParams: Promise<{ eventId: string }>;
}) {
  const { eventId } = await searchParams;

  let attendanceList = [];

  try {
    const response = await getAttendanceList(eventId);

    if (response.data) {
      attendanceList = response.data;
    }
  } catch (error) {
    console.error("Error fetching attendance list:", error);
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-bold md:text-xl">List of Attendance</h1>

      {attendanceList.length > 0 ? (
        <ul className="flex flex-col gap-2 mb-5">
          {attendanceList.map((attendee) => (
            <li
              key={attendee.id}
              className="border border-border bg-card text-card-foreground rounded-md shadow-md p-4 space-y-2"
            >
              <div className="flex justify-between items-center">
                <h2 className="font-bold">
                  {attendee.user_info?.full_name ??
                    attendee.user_info?.username}
                </h2>

                <span className="text-sm text-muted-foreground">
                  {attendee.ticket_type?.type}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">
                {attendee.auth?.email}
              </p>

              {attendee.auth?.phone && (
                <p className="text-sm text-muted-foreground">
                  {attendee.auth.phone}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        "None"
      )}
    </div>
  );
}
