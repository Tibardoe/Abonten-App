import { getUserPosts } from "@/actions/getUserPosts";
import { Button } from "@/components/ui/button";
import type { PostsType } from "@/types/postsType";
import { useEffect, useState } from "react";

export default function Posts() {
  const [posts, setPosts] = useState<PostsType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
        setError("An error occurred while fetching posts.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserPosts();
  }, []);

  if (loading) {
    return <p className="text-center">Loading posts...</p>;
  }

  if (error) {
    return <p className="text-red-500 text-center">{error}</p>;
  }

  return posts?.length ? (
    <ul>
      {posts.map((post) => (
        <li key={post.slug}>posts</li>
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
