import { supabase } from "@/lib/supabase";
import { parseRatingAggregate, roundRating } from "@abonten/core/ratings";
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
  organizer_verified: boolean;
  status_id: number | null;
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

  // Aggregated in Postgres (get_user_rating) rather than transferring every
  // review row written about this user.
  const { data: ratingRow, error: ratingsError } = await supabase
    .rpc("get_user_rating", { p_reviewed_id: row.user_id as string })
    .maybeSingle();
  if (ratingsError) throw ratingsError;

  // `user_profile_details` predates organizer verification and does not carry
  // its columns, so read them from `user_info` (publicly selectable) rather
  // than change a view other surfaces depend on — the same call the web
  // profile makes in actions/verification/getOrganizerVerified.ts.
  const { data: verifiedRow } = await supabase
    .from("user_info")
    .select("organizer_verified, status_id")
    .eq("id", row.user_id as string)
    .maybeSingle();

  const parsed = parseRatingAggregate(ratingRow);
  const total = parsed.count;
  const avg = roundRating(parsed.average);

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
    organizer_verified: verifiedRow?.organizer_verified === true,
    status_id: verifiedRow?.status_id ?? null,
  };
}

export function usePublicProfile(username: string | undefined) {
  return useQuery({
    queryKey: ["profile", "public", username],
    enabled: !!username,
    queryFn: () => fetchProfile(username as string),
  });
}
