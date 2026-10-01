import { publicSupabase } from "@/config/supabase/publicClient";
import ProfileDetails from "@/userAccount/organisms/ProfileDetails";
import ProfileHeaderSkeleton from "@/userAccount/organisms/ProfileHeaderSkeleton";
import type { Metadata } from "next";
import { Suspense } from "react";

// Public profile pages share one title: the person's display name (or
// handle) — the sub-pages (posts, places, reviews…) are tabs of it.
export async function generateMetadata({
  params,
}: LayoutProps): Promise<Metadata> {
  const { username } = await params;
  const { data } = await publicSupabase
    .from("user_info")
    .select("full_name, username")
    .eq("username", username)
    .maybeSingle();
  if (!data) return { title: "Profile not found" };
  const name = data.full_name?.trim() || `@${data.username}`;
  return {
    title: name,
    description: `${name} on Abonten Hub: events, places and reviews.`,
  };
}

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{
    username: string; // ← You get this for free
  }>;
};

export default async function layout({ children, params }: LayoutProps) {
  const username = (await params).username;

  return (
    <div className="flex flex-col gap-5">
      <Suspense fallback={<ProfileHeaderSkeleton />}>
        <ProfileDetails username={username} />
      </Suspense>

      <section className="flex flex-col w-full gap-10">{children}</section>
    </div>
  );
}
