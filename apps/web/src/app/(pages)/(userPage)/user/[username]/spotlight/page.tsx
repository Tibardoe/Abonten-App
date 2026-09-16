import { getUserProfileDetails } from "@/actions/getUserProfileDetails";
import PublisherSpotlightGrid from "@/spotlight/organisms/PublisherSpotlightGrid";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// An organizer's Spotlights. The grid hides itself while Spotlight is off
// for the visitor, so this tab is harmless before rollout.
export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await getUserProfileDetails(username);

  if (profile.status !== 200 || !profile.data.user_id) {
    return (
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Profile not found.
      </p>
    );
  }

  return (
    <PublisherSpotlightGrid
      publisherKind="organizer"
      publisherId={profile.data.user_id}
      emptyText={
        profile.ownUsername === username
          ? "You haven't posted a Spotlight yet."
          : "No Spotlights yet."
      }
    />
  );
}
