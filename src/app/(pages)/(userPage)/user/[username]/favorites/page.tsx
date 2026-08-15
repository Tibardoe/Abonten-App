import { getUserFavoritePosts } from "@/actions/getUserFavoritePosts";
import EventCard from "@/components/molecules/EventCard";
import type { FavoriteEvents } from "@/types/favoriteEventTypes";
import Link from "next/link";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

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
        <div className="text-center mt-5 text-destructive">
          Failed to load favorited posts: {response.message}
        </div>
      );
    }
  } catch (error) {
    console.log(error);

    return (
      <div className="text-center mt-5 text-destructive">
        An error occurred while fetching favorited posts.
      </div>
    );
  }

  return userFavoritedEvents?.length > 0 ? (
    <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0">
      {userFavoritedEvents.map((favorite, index) => {
        const event = favorite.event;
        return (
          <EventCard
            key={event.title}
            priority={index < 4}
            title={event.title}
            id={event.id}
            event_code={event.event_code}
            flyer_public_id={event.flyer_public_id}
            flyer_version={event.flyer_version}
            address={event.address}
            starts_at={event.starts_at}
            occurrences={event.event_occurrence}
            ends_at={event.ends_at}
            organizer_id={event.organizer_id}
            min_price={event.price}
            currency={event.currency ?? ""}
            created_at={event.created_at}
            attendanceCount={event.attendanceCount ?? 0}
          />
        );
      })}
    </ul>
  ) : (
    <div className="flex flex-col items-center">
      <h1 className="font-medium text-2xl">No Favorites added yet</h1>

      <p className="text-muted-foreground text-sm">
        Explore and save all your favorite events in one place
      </p>

      <Link
        href="/events"
        className="font-medium bg-primary text-primary-foreground py-1 px-5 rounded-md mt-5"
      >
        Explore events
      </Link>
    </div>
  );
}
