import getUserAttendingEvents from "@/actions/getUserAttendingEvents";
import Link from "next/link";

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

      {events.length > 0 ? (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <h2>{event.event.title}</h2>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        "No events here!"
      )}
    </div>
  );
}
