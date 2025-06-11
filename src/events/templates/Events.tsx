"use client";

import { getNearByEvents } from "@/actions/getNearByEvents";
import Banner from "@/components/molecules/Banner";
import EventCard from "@/components/molecules/EventCard";
import EventsSlider from "@/components/organisms/EventsSlider";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { happeningThisMonth } from "@/data/happeningThisMonth";
import { happeningThisWeek } from "@/data/happeningThisWeek";
import { happeningToday } from "@/data/happeningToday";
import { topRatedOrganizers } from "@/data/topRatedOrganizers";
import type { UserPostType } from "@/types/postsType";
import { useEffect, useState } from "react";

export default function Events() {
  const [coordinates, setCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [eventsNearBy, setEventsNearBy] = useState<UserPostType[] | null>(null);

  const [loading, setLoading] = useState(true);

  const [eventsAroundYou, setEventsAroundYou] = useState<UserPostType[] | null>(
    null,
  );

  useEffect(() => {
    const stored = localStorage.getItem("coordinates");

    if (stored) {
      const coords = JSON.parse(stored);
      setCoordinates({ lat: coords.lat, lng: coords.lng });
    } else {
      setCoordinates({ lat: 0, lng: 0 });
    }
  }, []);

  useEffect(() => {
    const fetchNearByEvents = async () => {
      if (!coordinates) return;

      try {
        const eventsWithinLocation = await getNearByEvents(
          coordinates.lat,
          coordinates.lng,
          10,
        );

        if (eventsWithinLocation) {
          setEventsNearBy(eventsWithinLocation.data);
          setLoading(false);
        }

        const nearbyEvents = await getNearByEvents(
          coordinates.lat,
          coordinates.lng,
          5,
        );

        setEventsAroundYou(nearbyEvents.data);
      } catch (error) {
        console.error(error);
      }
    };

    fetchNearByEvents();
  }, [coordinates]);

  if (loading) return "loading";

  return (
    <section className="space-y-10">
      {eventsNearBy?.length ? (
        <>
          <LocationAndFilterSection />

          <Banner />

          <EventsSlider
            heading="Around-You"
            events={eventsAroundYou || []}
            urlPath="hc/around-you"
          />

          <EventsSlider
            heading="Top-rated Organizers"
            events={topRatedOrganizers}
            urlPath="hc/top-rated-organizers"
          />

          <EventsSlider
            heading="Happening Today"
            events={happeningToday}
            urlPath="hc/happening-today"
          />

          <EventsSlider
            heading="Happening This Week"
            events={happeningThisWeek}
            urlPath="hc/happening-this-week"
          />

          <EventsSlider
            heading="Happening This Month"
            events={happeningThisMonth}
            urlPath="hc/happening-this-month"
          />

          <div className="mb-5">
            <h2 className="text-2xl font-bold mb-2">All Events</h2>

            <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5">
              {eventsNearBy.map((post) => (
                <EventCard
                  key={post.title}
                  title={post.title}
                  flyer_public_id={post.flyer_public_id}
                  flyer_version={post.flyer_version}
                  address={post.address}
                  starts_at={post.starts_at}
                  ends_at={post.ends_at}
                  price={post.price}
                  created_at={post.created_at}
                  capacity={post.capacity}
                />
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="w-full h-full flex flex-col gap-5 items-center justify-center">
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
