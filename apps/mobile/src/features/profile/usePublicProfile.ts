import { useSession } from "@/auth/SessionProvider";
import { NotFoundError } from "@/lib/queryErrors";
import { supabase } from "@/lib/supabase";
import { roundRating } from "@abonten/core/ratings";
import { type QueryClient, useQuery } from "@tanstack/react-query";

// A public user profile, keyed by username, in ONE request:
// get_public_profile returns the profile view's columns, the rating, the
// organizer verification flags, the follower count and whether you follow
// them (migration 20260919092000). It used to take three sequential reads
// (the view, then the rating, then user_info) and had no follower count at
// all — the count lived inside the Follow button, which your own profile
// does not show. The function runs as the caller (SECURITY INVOKER), so it
// sees exactly what those separate reads saw.
//
// The answer depends on who is asking (viewer_follows, and the view shows
// the owner their own drafts), so the viewer is part of the key.

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
  follower_count: number;
  viewer_follows: boolean;
};

export const PUBLIC_PROFILE_KEY = ["profile", "public"] as const;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function fetchProfile(username: string): Promise<PublicProfile> {
  const { data, error } = await supabase.rpc("get_public_profile", {
    p_username: username,
  });
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  if (!row || typeof row.user_id !== "string") {
    throw new NotFoundError("Profile");
  }

  return {
    user_id: row.user_id,
    username: String(row.username ?? username),
    full_name: str(row.full_name),
    bio: str(row.bio),
    avatar_public_id: str(row.avatar_public_id),
    avatar_version: str(row.avatar_version),
    total_posts: num(row.total_posts),
    total_favorites: num(row.total_favorites),
    average_rating: roundRating(num(row.average_rating)),
    total_ratings: num(row.total_ratings),
    organizer_verified: row.organizer_verified === true,
    status_id: typeof row.status_id === "number" ? row.status_id : null,
    follower_count: num(row.follower_count),
    viewer_follows: row.viewer_follows === true,
  };
}

export function usePublicProfile(username: string | undefined) {
  const { session } = useSession();
  return useQuery({
    queryKey: [...PUBLIC_PROFILE_KEY, username, session?.user.id ?? null],
    enabled: !!username,
    queryFn: () => fetchProfile(username as string),
  });
}

/**
 * Keeps every cached profile of `userId` in step with a follow change —
 * optimistically (`delta`) or with the server's answer (`followerCount`).
 */
export function patchProfileFollow(
  qc: QueryClient,
  userId: string,
  update: { following: boolean } & (
    | { delta: number }
    | { followerCount: number }
  ),
) {
  qc.setQueriesData<PublicProfile>({ queryKey: PUBLIC_PROFILE_KEY }, (old) => {
    if (!old || typeof old !== "object" || old.user_id !== userId) {
      return undefined;
    }
    const count =
      "followerCount" in update
        ? update.followerCount
        : Math.max(0, old.follower_count + update.delta);
    if (old.viewer_follows === update.following && old.follower_count === count)
      return undefined;
    return { ...old, viewer_follows: update.following, follower_count: count };
  });
}
