import { useSession } from "@/auth/SessionProvider";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

// The signed-in user's own `user_profile_details` row (same view the web
// header / profile page read). `@abonten/api-client`'s `ProfileData` types
// the view columns; this maps them to the app's camelless shape and coerces
// the bigint/numeric aggregates PostgREST serialises as strings.

export type MyProfile = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
  total_posts: number;
  total_favorites: number;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

export function useProfile() {
  const { session } = useSession();

  return useQuery({
    queryKey: ["mobile", "profile"],
    enabled: !!session,
    queryFn: async (): Promise<MyProfile | null> => {
      const res = await api.profile.get();
      if (res.status !== 200 || !res.data) return null;
      const d = res.data;
      return {
        user_id: String(d.user_id ?? session?.user.id ?? ""),
        username: str(d.username),
        full_name: str(d.full_name),
        bio: str(d.bio),
        avatar_public_id: str(d.avatar_public_id),
        avatar_version: str(d.avatar_version),
        total_posts: num(d.total_posts),
        total_favorites: num(d.total_favorites),
      };
    },
  });
}
