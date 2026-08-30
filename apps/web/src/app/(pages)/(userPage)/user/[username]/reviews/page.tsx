import { getOwnedPlaceReviews } from "@/actions/getOwnedPlaceReviews";
import { getUserReviews } from "@/actions/getUserReviews";
import AddReviewButton from "@/components/atoms/AddReviewButton";
import UserReviewsTabs from "./UserReviewsTabs";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const [eventReviewsFirstPage, placeReviewsFirstPage] = await Promise.all([
    getUserReviews(username),
    getOwnedPlaceReviews(username),
  ]);

  if (eventReviewsFirstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-destructive">
        Failed to load reviews: {eventReviewsFirstPage.message}
      </div>
    );
  }

  async function fetchEventReviewsPage(cursor: string | null) {
    "use server";
    return getUserReviews(username, { cursor });
  }

  async function fetchPlaceReviewsPage(cursor: string | null) {
    "use server";
    return getOwnedPlaceReviews(username, { cursor });
  }

  const eventReviewsEmptyState = (
    <div className="flex flex-col items-center justify-center mt-10 gap-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">No reviews yet</h1>
      <p className="text-muted-foreground">
        Be the first to leave a review and rating.
      </p>
      <AddReviewButton username={username} />
    </div>
  );

  const placeReviewsEmptyState = (
    <div className="flex flex-col items-center justify-center mt-10 gap-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">
        No place reviews yet
      </h1>
      <p className="text-muted-foreground">
        Reviews of places this user owns will show up here.
      </p>
    </div>
  );

  return (
    <UserReviewsTabs
      eventReviewsQueryKey={["user-reviews", username]}
      eventReviewsInitialPage={eventReviewsFirstPage}
      fetchEventReviewsPage={fetchEventReviewsPage}
      eventReviewsEmptyState={eventReviewsEmptyState}
      placeReviewsQueryKey={["owned-place-reviews", username]}
      placeReviewsInitialPage={
        placeReviewsFirstPage.status === 200
          ? placeReviewsFirstPage
          : { status: 200, data: [], nextCursor: null, hasNextPage: false }
      }
      fetchPlaceReviewsPage={fetchPlaceReviewsPage}
      placeReviewsEmptyState={placeReviewsEmptyState}
    />
  );
}
