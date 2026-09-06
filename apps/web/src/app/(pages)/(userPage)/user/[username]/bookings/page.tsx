import { getUserBookings } from "@/actions/getUserBookings";
import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import { notFound } from "next/navigation";
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
 * "my bookings" is inherently private. The `:username` in the route is only
 * meaningful when it's yours: if someone opens another person's
 * /user/<them>/bookings URL directly we 404 rather than silently render the
 * viewer's own bookings under the wrong name. Same guard on favorites/page.tsx.
 */
export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getUserProfileDetails(username);
  if (profile.status !== 200 || profile.ownUsername !== username) {
    notFound();
  }

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
