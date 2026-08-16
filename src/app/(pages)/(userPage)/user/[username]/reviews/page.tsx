import { getUserReviews } from "@/actions/getUserReviews";
import AddReviewButton from "@/components/atoms/AddReviewButton";
import UserReviewsList from "./UserReviewsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const firstPage = await getUserReviews(username);

  if (firstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-destructive">
        Failed to load reviews: {firstPage.message}
      </div>
    );
  }

  async function fetchPage(cursor: string | null) {
    "use server";
    return getUserReviews(username, { cursor });
  }

  const emptyState = (
    <div className="flex flex-col items-center justify-center mt-10 gap-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">No reviews yet</h1>
      <p className="text-muted-foreground">
        Be the first to leave a review and rating.
      </p>
      <AddReviewButton username={username} />
    </div>
  );

  return (
    <UserReviewsList
      queryKey={["user-reviews", username]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
    />
  );
}
