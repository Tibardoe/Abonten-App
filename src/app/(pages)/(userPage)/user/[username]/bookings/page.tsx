import { getUserBookings } from "@/actions/getUserBookings";
import UserBookingsList from "./UserBookingsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = (
  <div className="flex flex-col items-center">
    <h1 className="font-medium text-2xl">No bookings yet</h1>

    <p className="text-muted-foreground text-sm">
      Your booking requests to places will show up here.
    </p>
  </div>
);

/**
 * getUserBookings.ts is self-scoped (auth.getUser(), no username param) --
 * same "always the signed-in viewer's own data, regardless of the profile
 * being viewed" shape getUserFavoritePosts/getUserFavoritePlaces already use
 * on the Favorites tab (see favorites/page.tsx). The nav tab that links here
 * is isCurrentUser-gated (see UserAccountTabsNavigation.tsx), so this only
 * reads as "wrong" if someone directly visits another user's /bookings URL
 * -- the same pre-existing quirk Favorites already has, not something new
 * introduced here.
 */
export default async function page() {
  const firstPage = await getUserBookings();

  if (firstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-destructive">
        Failed to load bookings: {firstPage.message}
      </div>
    );
  }

  async function fetchPage(cursor: string | null) {
    "use server";
    return getUserBookings({ cursor });
  }

  return (
    <UserBookingsList
      queryKey={["user-bookings"]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
    />
  );
}
