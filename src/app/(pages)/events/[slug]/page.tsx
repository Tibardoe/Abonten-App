import { getEvents } from "@/actions/getEvents";
import EventCard from "@/components/molecules/EventCard";
import EventsSlider from "@/components/organisms/EventsSlider";
import { Button } from "@/components/ui/button";
import { allEvents } from "@/data/allEvents";
import { formatDateWithSuffix } from "@/utils/dateFormatter";
import Image from "next/image";
import Link from "next/link";

export default async function page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const title = (await params).slug;

  const unformatTitle = title
    .split("-") // Split the string by hyphens

    .join(" "); // Join the words back with spaces

  const event = allEvents.find(
    (event) => event.title.toLowerCase() === unformatTitle,
  );

  const similarEvents = allEvents.filter(
    (events) => events.category === event?.category,
  );

  if (!event) {
    return <p>No event found</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-4">
        <h1>Posted by</h1>

        <div className="flex justify-between">
          <div className="flex gap-2">
            <div className="bg-black rounded-full w-20 h-20" />

            <div>
              <p>Big_Ceo</p>
              <p>
                <span className="font-bold">7.8</span> Ratings
              </p>
            </div>
          </div>

          <p>1hour ago</p>
        </div>
      </div>

      <div className="md:flex gap-5">
        <Image
          src={event.flyerUrl}
          alt="Event flyer"
          width={500}
          height={500}
          className="w-full md:w-[700px] md:h-[650px] rounded-xl"
        />

        {/* Event details */}
        <div className="flex flex-col gap-5">
          {/* title */}
          <h2 className="font-bold text-lg md:text-2xl">{event.title}</h2>

          {/* description */}
          <div>
            <h2 className="font-bold md:text-lg">Description</h2>
            <p className="text-justify">{event.description}</p>
          </div>

          {/* Event date, time, location and price */}
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="flex items-center">
              <Image
                src="/assets/images/location.svg"
                alt="Event flyer"
                width={20}
                height={20}
              />

              <p>{event.location}</p>
            </div>

            <div className="flex items-center gap-2">
              <Image
                src="/assets/images/date.svg"
                alt="Event flyer"
                width={15}
                height={15}
              />

              <p>
                {event.startDate
                  ? formatDateWithSuffix(event.startDate)
                  : "Date not available"}{" "}
                -
                {event.endDate
                  ? formatDateWithSuffix(event.startDate)
                  : "End date not available"}
              </p>
            </div>

            <div className="flex items-center gap-1">
              <Image
                src="/assets/images/time.svg"
                alt="Event flyer"
                width={20}
                height={20}
              />

              <p>{event.time}</p>
            </div>

            <p>{event.price}</p>
          </div>

          {/* Buttons */}

          <div className="flex flex-col gap-3">
            <Button className="font-bold rounded-full w-full p-6 text-lg">
              Buy Ticket
            </Button>

            <div className="grid grid-cols-2 outline-none gap-3">
              <Button
                variant="outline"
                className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
              >
                <Image
                  src="/assets/images/direction.svg"
                  alt="Direction"
                  width={30}
                  height={30}
                />
                Direction
              </Button>
              <Button
                variant="outline"
                className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
              >
                <Image
                  src="/assets/images/share.svg"
                  alt="Share"
                  width={30}
                  height={30}
                />
                Share
              </Button>
              <Button
                variant="outline"
                className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
              >
                <Image
                  src="/assets/images/website.svg"
                  alt="Website"
                  width={30}
                  height={30}
                />
                Website
              </Button>
              <Button
                variant="outline"
                className="rounded-full text-lg p-5 md:p-6 border border-black flex items-center gap-3"
              >
                <Image
                  src="/assets/images/contact.svg"
                  alt="Contact"
                  width={30}
                  height={30}
                />
                Contact
              </Button>
            </div>

            {/* Event category and tag */}
            <div className="space-y-5 mt-5">
              <div className="space-y-2">
                <h2 className="font-bold md:text-lg">EVENT CATEGORY</h2>
                <Button
                  variant="outline"
                  className="rounded-xl text-lg p-5 md:p-6 border border-black w-full"
                >
                  {event.category}
                </Button>
              </div>

              <div className="space-y-2">
                <h2 className="font-bold md:text-lg">TAG</h2>
                <Button
                  variant="outline"
                  className="rounded-xl text-lg p-5 md:p-6 border border-black w-full"
                >
                  {event.type}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EventsSlider
        heading="Similar Events"
        events={similarEvents}
        eventCategory={event.category}
      />
    </div>
  );
}
