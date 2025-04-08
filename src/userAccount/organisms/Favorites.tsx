import { getUserFavoritePosts } from "@/actions/getUserFavoritePosts";
import EventCard from "@/components/molecules/EventCard";
import { userFavoritedEvents } from "@/data/userFavoritedEvents";
import type { FavoriteEvents } from "@/types/favoriteEventTypes";
import Link from "next/link";
import React, { useEffect, useState } from "react";

export default function Favorites() {
  const [favorites, setfavorites] = useState<FavoriteEvents[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserPosts = async () => {
      try {
        const response = await getUserFavoritePosts();

        if (response.status === 200 && response.data) {
          setfavorites(response.data);
        } else {
          setError(`Failed to load posts.- ${response.message}`);
        }
      } catch (error) {
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

  return userFavoritedEvents?.length > 0 ? (
    <ul className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-x-2 gap-y-5 mb-5 md:mb-0">
      {userFavoritedEvents.map((post) => (
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
      <h1 className="font-bold text-2xl">No Favorites added yet</h1>

      <p>Explore and save all your favorite events in one place</p>

      <Link
        href="#"
        className="font-bold md:text-lg text-white bg-black py-1 px-5 rounded-md"
      >
        Explore events
      </Link>
    </div>
  );
}
