import { getUserPosts } from "@/actions/getUserPosts";
import PostButton from "@/components/atoms/PostButton";
import UserPostsList from "./UserPostsList";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

const emptyState = (
  <div className="flex flex-col items-center">
    <h1 className="font-bold text-2xl">No events yet</h1>

    <p className="text-sm text-muted-foreground">
      Post events for others to attend
    </p>

    <PostButton />
  </div>
);

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const firstPage = await getUserPosts(username);

  if (firstPage.status !== 200) {
    return (
      <div className="text-center mt-5 text-red-500">
        Failed to load events: {firstPage.message}
      </div>
    );
  }

  async function fetchPage(cursor: string | null) {
    "use server";
    return getUserPosts(username, { cursor });
  }

  return (
    <UserPostsList
      queryKey={["user-posts", username]}
      initialPage={firstPage}
      fetchPage={fetchPage}
      emptyState={emptyState}
    />
  );
}
