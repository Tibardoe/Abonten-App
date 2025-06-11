import { getUserPosts } from "@/actions/getUserPosts";
import EventCard from "@/components/molecules/EventCard";
import { Button } from "@/components/ui/button";
import { userEvents } from "@/data/userEvents";
import type { PostsType } from "@/types/postsType";
// import Image from "next/image";
// import Link from "next/link";
import { useEffect, useState } from "react";

export default function Posts() {
  // const [posts, setPosts] = useState<PostsType[]>([]);
  // const [loading, setLoading] = useState<boolean>(true);
  // const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserPosts = async () => {
      try {
        const response = await getUserPosts();

        if (response.status === 200 && response.data) {
          setPosts(response.data);
        } else {
          setError(`Failed to load posts.- ${response.message}`);
        }
      } catch (error) {
        console.log(error);

        setError("An error occurred while fetching posts.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserPosts();
  }, []);

  // if (loading) {
  //   return <p className="text-center">Loading posts...</p>;
  // }

  // if (error) {
  //   return <p className="text-red-500 text-center">{error}</p>;
  // }

  return userEvents?.length ? (
    <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0">
      {userEvents.map((post) => (
        <EventCard
          key={post.title}
          title={post.title}
          flyerUrl={post.flyerUrl}
          location={post.location}
          start_at={post.startDate}
          end_at={post.endDate}
          timezone={post.time}
          price={post.price}
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
