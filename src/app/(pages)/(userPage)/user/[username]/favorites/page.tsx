import { getUserFavoritePosts } from "@/actions/getUserFavoritePosts";
import EventCard from "@/components/molecules/EventCard";
import type { FavoriteEvents } from "@/types/favoriteEventTypes";
import Link from "next/link";

export default async function page() {
  let userFavoritedEvents: FavoriteEvents[] = [];

  try {
    const response = await getUserFavoritePosts();

    if (
      response.status === 200 &&
      response.favoritesWithMinPriceAndAttendance
    ) {
      userFavoritedEvents = response.favoritesWithMinPriceAndAttendance;
    } else {
      return (
        <div className="text-center mt-5 text-red-500">
          Failed to load favorited posts: {response.message}
        </div>
      );
    }
  } catch (error) {
    return (
      <div className="text-center mt-5 text-red-500">
        An error occurred while fetching favorited posts.
      </div>
    );
  }

  return userFavoritedEvents?.length > 0 ? (
    <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0">
      {userFavoritedEvents.map((favorite) => {
        const event = favorite.event;
        return (
          <EventCard
            key={event.title}
            title={event.title}
            id={event.id}
            flyer_public_id={event.flyer_public_id}
            flyer_version={event.flyer_version}
            address={event.address}
            starts_at={event.starts_at}
            event_dates={event.event_dates}
            ends_at={event.ends_at}
            min_price={event.price}
            currency={event.currency ?? ""}
            created_at={event.created_at}
            attendanceCount={event.attendanceCount ?? 0}
          />
        );
      })}
    </ul>
  ) : (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">No Favorites added yet</h1>

      <p>Explore and save all your favorite events in one place</p>

      <Link
        href="/events"
        className="font-bold md:text-lg text-white bg-black py-1 px-5 rounded-md"
      >
        Explore events
      </Link>
    </div>
  );
}
