import { getFilteredEvents } from "@/actions/getFilteredEvents";
import { getNearByEvents } from "@/actions/getNearByEvents";
import Banner from "@/components/molecules/Banner";
import EventCard from "@/components/molecules/EventCard";
import EventsSlider from "@/components/organisms/EventsSlider";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import type { UserPostType } from "@/types/postsType";
import { getDailyEvent } from "@/utils/dailyEventCache";
import { geocodeAddress } from "@/utils/geocodeServerSide";

export default async function page({
  params,
}: {
  params: Promise<{ location: string }>;
}) {
  const { location } = await params;

  const safeLocation = location ?? "";

  const res = await geocodeAddress(safeLocation);

  const { lat, lng } = res;

  const eventsWithinLocation = await getNearByEvents(lat, lng, 10000);

  const eventsAroundYou = await getNearByEvents(lat, lng, 5000);

  const aroundYou: UserPostType[] = eventsAroundYou.data || [];

  const events: UserPostType[] = eventsWithinLocation.data || [];

  const topRatedOrganizers: UserPostType[] = await getFilteredEvents({
    lat: lat,
    lng: lng,
    filter: "top-rated-organizers",
    radius: 10000,
  });

  const happeningToday: UserPostType[] = await getFilteredEvents({
    lat: lat,
    lng: lng,
    filter: "happening-today",
    radius: 10000,
  });

  const happeningThisWeek: UserPostType[] = await getFilteredEvents({
    lat: lat,
    lng: lng,
    filter: "happening-this-week",
    radius: 10000,
  });

  const happeningThisMonth: UserPostType[] = await getFilteredEvents({
    lat: lat,
    lng: lng,
    filter: "happening-this-month",
    radius: 10000,
  });

  const selected = await getDailyEvent(events, safeLocation);

  return (
    <section className="space-y-5 min-h-dvh">
      <LocationAndFilterSection />

      {eventsWithinLocation.data?.length ? (
        <>
          <Banner event={selected} />

          <EventsSlider
            heading="Around-You"
            events={aroundYou || []}
            urlPath={`/location${safeLocation}/explore/around-you`}
          />

          <EventsSlider
            heading="Top-rated Organizers"
            events={topRatedOrganizers}
            urlPath={`/location/${safeLocation}/explore/top-rated-organizers`}
          />

          <EventsSlider
            heading="Happening Today"
            events={happeningToday}
            urlPath={`/location/${safeLocation}/explore/happening-today`}
          />

          <EventsSlider
            heading="Happening This Week"
            events={happeningThisWeek}
            urlPath={`/location/${safeLocation}/explore/happening-this-week`}
          />

          <EventsSlider
            heading="Happening This Month"
            events={happeningThisMonth}
            urlPath={`/location/${safeLocation}/explore/happening-this-month`}
          />

          <div className="mb-5">
            <h2 className="text-2xl font-bold mb-2">All Events</h2>

            <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-3">
              {events.map((post) => (
                <EventCard
                  key={post.title}
                  id={post.id}
                  title={post.title}
                  flyer_public_id={post.flyer_public_id}
                  flyer_version={post.flyer_version}
                  address={post.address}
                  event_code={post.event_code}
                  starts_at={post.starts_at}
                  ends_at={post.ends_at}
                  organizer_id={post.organizer_id}
                  event_dates={post.event_dates}
                  minTicket={post.minTicket}
                  created_at={post.created_at}
                  capacity={post.capacity}
                  min_price={post.min_price}
                  currency={post.currency}
                  attendanceCount={post.attendanceCount}
                  status={post.status}
                />
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="h-[50%] flex flex-col gap-5 items-center justify-center">
          <div>
            <h2 className="font-bold">
              Sorry, no events available in this location
            </h2>
            <p>
              Change your location to explore other places events or post an
              event
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
