"use client";

import Banner from "@/components/molecules/Banner";
import EventCard from "@/components/molecules/EventCard";
import EventsSlider from "@/components/organisms/EventsSlider";
import LocationAndFilterSection from "@/components/organisms/LocationAndFilterSection";
import { supabase } from "@/config/supabase/client";
import { useAuth } from "@/context/authContext";
import { allEvents } from "@/data/allEvents";
import { aroundYou } from "@/data/aroundYou";
import { happeningThisMonth } from "@/data/happeningThisMonth";
import { happeningThisWeek } from "@/data/happeningThisWeek";
import { happeningToday } from "@/data/happeningToday";
import { topRatedOrganizers } from "@/data/topRatedOrganizers";
import useUserProfile from "@/hooks/useUserProfile";
import { fetchAuthenticatedUser } from "@/services/authService";
import type { userProfileType } from "@/types/userProfileType";
import React, { useEffect } from "react";

export default function Events() {
  const { session } = useAuth();

  useEffect(() => {
    const getUser = async () => {
      if (!session) return;

      await fetchAuthenticatedUser();
    };

    getUser();
  }, [session]);

  return (
    <section className="space-y-10">
      <LocationAndFilterSection />

      <Banner />

      <EventsSlider
        heading="Around-You"
        events={aroundYou}
        urlPath="around-you"
      />

      <EventsSlider
        heading="Top-rated Organizers"
        events={topRatedOrganizers}
        urlPath="top-rated-organizers"
      />

      <EventsSlider
        heading="Happening Today"
        events={topRatedOrganizers}
        urlPath="happening-today"
      />

      <EventsSlider
        heading="Happening Today"
        events={happeningToday}
        urlPath="happening-today"
      />

      <EventsSlider
        heading="Happening This Week"
        events={happeningThisWeek}
        urlPath="happening-this-week"
      />

      <EventsSlider
        heading="Happening This Month"
        events={happeningThisMonth}
        urlPath="happening-this-month"
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
