import getUserAttendingEvents from "@/actions/getUserAttendingEvents";

export default async function page() {
  let events = [];

  try {
    const response = await getUserAttendingEvents();

    if (response?.data) {
      events = response.data;
    }
  } catch (error) {
    console.error("Error fetching user attending events:", error);
  }

  return (
    <div>
      <h1 className="font-bold md:text-xl">List of Attending Events</h1>
    </div>
  );
}
