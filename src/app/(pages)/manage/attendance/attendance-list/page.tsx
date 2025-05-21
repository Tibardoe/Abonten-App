import getAttendanceList from "@/actions/getAttendanceList";

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
    <div>
      <h1 className="font-bold md:text-xl">List of Attendance</h1>
    </div>
  );
}
