"use client";

import Banner from "@/components/molecules/Banner";
import EventCard from "@/components/molecules/EventCard";
import EventsSlider from "@/components/organisms/EventsSlider";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { allEvents } from "@/data/allEvents";
import { aroundYou } from "@/data/aroundYou";
import { happeningThisMonth } from "@/data/happeningThisMonth";
import { happeningThisWeek } from "@/data/happeningThisWeek";
import { happeningToday } from "@/data/happeningToday";
import { topRatedOrganizers } from "@/data/topRatedOrganizers";

export default function Events() {
  return (
    <section className="space-y-10">
      <LocationAndFilterSection />

      <Banner />

      <EventsSlider
        heading="Around-You"
        events={aroundYou}
        urlPath="hc/around-you"
      />

      <EventsSlider
        heading="Top-rated Organizers"
        events={topRatedOrganizers}
        urlPath="hc/top-rated-organizers"
      />

      <EventsSlider
        heading="Happening Today"
        events={topRatedOrganizers}
        urlPath="hc/happening-today"
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
          {allEvents.map((post) => (
            <EventCard
              key={post.title}
              title={post.title}
              flyerUrl={post.flyerUrl}
              location={post.location}
              start_at={post.startDate}
              end_at={post.endDate}
              timezone={post.time}
              price={post.price}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
