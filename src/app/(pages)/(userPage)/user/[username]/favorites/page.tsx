import { getUserFavoritePlaces } from "@/actions/getUserFavoritePlaces";
import { getUserFavoritePosts } from "@/actions/getUserFavoritePosts";
import Link from "next/link";
import FavoritePlacesList from "./FavoritePlacesList";
import FavoritesList from "./FavoritesList";

// TODO: Cache Components adoption. Refactor this route can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const eventsEmptyState = (
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

const placesEmptyState = (
  <div className="flex flex-col items-center">
    <h1 className="font-medium text-2xl">No favorite places yet</h1>

    <p className="text-muted-foreground text-sm">
      Explore and save all your favorite places in one place
    </p>

    <Link
      href="/places"
      className="font-medium bg-primary text-primary-foreground py-1 px-5 rounded-md mt-5"
    >
      Explore places
    </Link>
  </div>
);

// Two independent sub-sections -- Favorite Events (unchanged) and Favorite
// Places (Milestone 7) -- each with its own query key/empty state, since a
// user can have favorites in one and none in the other.
export default async function page() {
  const [eventsFirstPage, placesFirstPage] = await Promise.all([
    getUserFavoritePosts(),
    getUserFavoritePlaces(),
  ]);

  async function fetchEventsPage(cursor: string | null) {
    "use server";
    return getUserFavoritePosts({ cursor });
  }

  async function fetchPlacesPage(cursor: string | null) {
    "use server";
    return getUserFavoritePlaces({ cursor });
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-xl">Favorite Events</h2>

        {eventsFirstPage.status !== 200 ? (
          <div className="text-center mt-5 text-destructive">
            Failed to load favorited posts: {eventsFirstPage.message}
          </div>
        ) : (
          <FavoritesList
            queryKey={["favorites"]}
            initialPage={eventsFirstPage}
            fetchPage={fetchEventsPage}
            emptyState={eventsEmptyState}
          />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-bold md:text-xl">Favorite Places</h2>

        {placesFirstPage.status !== 200 ? (
          <div className="text-center mt-5 text-destructive">
            Failed to load favorited places: {placesFirstPage.message}
          </div>
        ) : (
          <FavoritePlacesList
            queryKey={["favorite-places"]}
            initialPage={placesFirstPage}
            fetchPage={fetchPlacesPage}
            emptyState={placesEmptyState}
          />
        )}
      </section>
    </div>
  );
}
