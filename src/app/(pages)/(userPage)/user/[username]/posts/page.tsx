import { getUserPosts } from "@/actions/getUserPosts";
import EventCard from "@/components/molecules/EventCard";
import { Button } from "@/components/ui/button";
import type { UserPostType } from "@/types/postsType";

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const username = (await params).username;

  let userPosts: UserPostType[] = [];

  try {
    const response = await getUserPosts(username);

    if (response.status === 200 && response.data) {
      userPosts = response.data;
    } else {
      return (
        <div className="text-center mt-5 text-red-500">
          Failed to load posts: {response.message}
        </div>
      );
    }
  } catch (error) {
    return (
      <div className="text-center mt-5 text-red-500">
        An error occurred while fetching posts.
      </div>
    );
  }

  return userPosts?.length ? (
    <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0">
      {userPosts.map((post) => (
        <EventCard
          key={post.title}
          title={post.title}
          flyer_public_id={post.flyer_public_id}
          flyer_version={post.flyer_version}
          address={post.address}
          starts_at={post.starts_at}
          ends_at={post.ends_at}
          price={post.price}
          created_at={post.created_at}
          capacity={post.capacity}
        />
      ))}
    </ul>
  ) : (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">No posts yet</h1>

      <p>Post events for others to attend</p>

      <Button className="font-bold md:text-lg px-10">Post</Button>
    </div>
  );
}
