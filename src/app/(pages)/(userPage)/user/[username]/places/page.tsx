import getOrganizerPlaces from "@/actions/getOrganizerPlaces";
import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import CreatePlaceButton from "@/places/atoms/CreatePlaceButton";
import UserPlacesList from "./UserPlacesList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const ownEmptyState = (
  <div className="flex flex-col items-center">
    <h1 className="font-bold text-2xl">No places yet</h1>

    <p className="text-sm text-muted-foreground">
      List your business or venue for others to discover
    </p>

    <CreatePlaceButton />
  </div>
);

const otherEmptyState = (
  <p className="text-center mt-5 text-muted-foreground text-sm">
    No places yet.
  </p>
);

// getOrganizerPlaces now accepts an optional username (mirrors
// getUserPosts) so this page can show any profile's public places, not
// just the signed-in viewer's own -- see getOrganizerPlaces.ts.
export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const profile = await getUserProfileDetails(username);
  const isCurrentUser =
    profile.status === 200 && profile.ownUsername === username;

  const firstPage = await getOrganizerPlaces({ username });

  if (firstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-destructive">
        Failed to load places: {firstPage.message}
      </div>
    );
  }

  async function fetchPage(cursor: string | null) {
    "use server";
    return getOrganizerPlaces({ username, cursor });
  }

  return (
    <UserPlacesList
      queryKey={["places-owned", username]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={isCurrentUser ? ownEmptyState : otherEmptyState}
    />
  );
}
