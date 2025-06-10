import { getUserPosts } from "@/actions/getUserPosts";
import PostButton from "@/components/atoms/PostButton";
import EventCard from "@/components/molecules/EventCard";
import type { UserPostType } from "@/types/postsType";

export default async function page({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  let userPosts: UserPostType[] = [];

  try {
    const response = await getUserPosts(username);

    if (response.status === 200 && response.eventsWithMinPriceAndAttendance) {
      userPosts = response.eventsWithMinPriceAndAttendance;
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
      {userPosts.map((post) => {
        return (
          <EventCard
            key={post.title}
            id={post.id}
            title={post.title}
            flyer_public_id={post.flyer_public_id}
            flyer_version={post.flyer_version}
            address={post.address}
            event_code={post.event_code}
            starts_at={post.starts_at}
            ends_at={post.ends_at}
            event_dates={post.event_dates}
            min_price={post.min_price}
            currency={post.currency}
            created_at={post.created_at}
            capacity={post.capacity}
            attendanceCount={post.attendanceCount}
            status={post.status}
          />
        );
      })}
    </ul>
  ) : (
    <div className="flex flex-col items-center gap-3">
      <h1 className="font-bold text-2xl">No posts yet</h1>

      <p>Post events for others to attend</p>

      <PostButton />
    </div>
  );
}
