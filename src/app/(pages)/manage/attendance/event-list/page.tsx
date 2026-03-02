import getOrganizerEvents from "@/actions/getOrganizerEvents";
import { getFormattedEventDate } from "@/utils/dateFormatter";
import Link from "next/link";
import { FaChevronRight } from "react-icons/fa";
import { IoTimeOutline } from "react-icons/io5";
import { MdOutlineDateRange } from "react-icons/md";

export default async function page() {
  let events = [];
  try {
    const response = await getOrganizerEvents();

    if (response.data) {
      events = response.data;
    }
  } catch (error) {
    console.log(error);
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-bold md:text-xl">List of Events Created</h1>

      {events.length > 0 ? (
        <ul className="flex flex-col gap-2 mb-5">
          {events.map((event) => {
            const dateTime = getFormattedEventDate(
              event.starts_at,
              event.ends_at,
              event.event_dates,
            );

            return (
              <li
                key={event.title}
                className="border rounded-md shadow-md p-4 space-y-2"
              >
                <div className="flex justify-between items-center">
                  <Link
                    href={`/manage/attendance/attendance-list?eventId=${event.id}`}
                  >
                    <h2 className="font-bold">{event.title}</h2>
                  </Link>

                  <Link
                    href={`/manage/attendance/attendance-list?eventId=${event.id}`}
                  >
                    <FaChevronRight className="md:text-xl" />
                  </Link>
                </div>

                <div className="flex items-center gap-2">
                  <MdOutlineDateRange className="text-xl shrink-0" />
                  <p className="text-sm text-gray-600">
                    {dateTime ? dateTime.date : "Date not available"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <IoTimeOutline className="text-xl shrink-0" />
                  <p className="text-sm text-gray-600">
                    {dateTime ? dateTime.time : "Date not available"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        "None"
      )}
    </div>
  );
}
