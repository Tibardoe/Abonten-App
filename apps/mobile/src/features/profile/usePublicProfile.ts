import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

// A public user profile, keyed by username — the native echo of the web
// `getUserProfileDetails` + `getUserRating`. `user_profile_details` is an
// intentionally public view (migration 20260825105625's comment); `review`
// is anon-readable, so both reads run straight from the client.

export type PublicProfile = {
  user_id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
  total_posts: number;
  total_favorites: number;
  average_rating: number;
  total_ratings: number;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

async function fetchProfile(username: string): Promise<PublicProfile> {
  const { data, error } = await supabase
    .from("user_profile_details")
    .select("*")
    .eq("username", username)
    .single();
  if (error) throw error;

  const row = data as Record<string, unknown>;

  const { data: ratings, error: ratingsError } = await supabase
    .from("review")
    .select("rating")
    .eq("reviewed_id", row.user_id as string);
  if (ratingsError) throw ratingsError;

  const list = (ratings ?? []) as { rating: number }[];
  const total = list.length;
  const avg =
    total > 0
      ? Number((list.reduce((a, r) => a + r.rating, 0) / total).toFixed(1))
      : 0;

  return {
    user_id: row.user_id as string,
    username: row.username as string,
    full_name: str(row.full_name),
    bio: str(row.bio),
    avatar_public_id: str(row.avatar_public_id),
    avatar_version: str(row.avatar_version),
    total_posts: num(row.total_posts),
    total_favorites: num(row.total_favorites),
    average_rating: avg,
    total_ratings: total,
  };
}

export function usePublicProfile(username: string | undefined) {
  return useQuery({
    queryKey: ["profile", "public", username],
    enabled: !!username,
    queryFn: () => fetchProfile(username as string),
  });
}
