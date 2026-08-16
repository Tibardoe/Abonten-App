import { getUserFavoritePosts } from "@/actions/getUserFavoritePosts";
import Link from "next/link";
import FavoritesList from "./FavoritesList";

// TODO: Cache Components adoption. Refactor this route can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = (
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

export default async function page() {
  const firstPage = await getUserFavoritePosts();

  if (firstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-destructive">
        Failed to load favorited posts: {firstPage.message}
      </div>
    );
  }

  async function fetchPage(cursor: string | null) {
    "use server";
    return getUserFavoritePosts({ cursor });
  }

  return (
    <FavoritesList
      queryKey={["favorites"]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
    />
  );
}
