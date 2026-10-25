import JsonLd from "@/components/atoms/JsonLd";
import { publicSupabase } from "@/config/supabase/publicClient";
import ProfileDetails from "@/userAccount/organisms/ProfileDetails";
import ProfileHeaderSkeleton from "@/userAccount/organisms/ProfileHeaderSkeleton";
import { isIndexedAccount } from "@/utils/searchIndexing";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { buildAvatarUrl } from "@abonten/core/cloudinaryUrl";
import { jsonLdGraph } from "@abonten/core/seo/jsonLd";
import { profilePath } from "@abonten/core/seo/paths";
import { snippetText } from "@abonten/core/seo/snippet";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense, cache } from "react";

// The profile as search engines see it. Only a host's profile (someone with
// a published event, or a place they have claimed) is offered to them: a
// person who only buys tickets and writes reviews has a public page, but
// not one to show in search results under their name.
const loadProfile = cache(async (username: string) => {
  const { data } = await publicSupabase
    .from("user_info")
    .select(
      "id, full_name, username, bio, avatar_public_id, avatar_version, status_id",
    )
    .eq("username", username)
    .maybeSingle();
  if (!data) return null;
  const [events, places] = await Promise.all([
    publicSupabase
      .from("event")
      .select("id", { count: "exact", head: true })
      .eq("organizer_id", data.id)
      .eq("status", "published"),
    publicSupabase
      .from("place")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", data.id)
      .eq("status", "published")
      .eq("claimed", true),
  ]);
  const isHost = (events.count ?? 0) > 0 || (places.count ?? 0) > 0;
  return {
    ...data,
    indexed: isHost && data.status_id === 1 && isIndexedAccount(data.id),
  };
});

// Public profile pages share one title: the person's display name (or
// handle) — the sub-pages (posts, places, reviews…) are tabs of it, and
// each names its own address (profileTabMetadata.ts).
export async function generateMetadata({
  params,
}: LayoutProps): Promise<Metadata> {
  const t = await getTranslations("account");

  const { username } = await params;
  const profile = await loadProfile(username);
  if (!profile) return { title: t("profileNotFound") };
  const name = profile.full_name?.trim() || `@${profile.username}`;
  const description =
    snippetText(profile.bio) || t("onAbontenHubEventsPlacesAnd", { name });
  const avatar = profile.avatar_public_id
    ? buildAvatarUrl(profile.avatar_public_id, profile.avatar_version, {
        width: 400,
        height: 400,
      })
    : undefined;
  return {
    title: name,
    description,
    ...(profile.indexed ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      title: name,
      description,
      type: "profile",
      url: profilePath(profile.username ?? username),
      ...(avatar ? { images: [{ url: avatar, width: 800, height: 800 }] } : {}),
    },
    twitter: { card: "summary", title: name, description },
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
  const profile = await loadProfile(username);

  return (
    <div className="flex flex-col gap-5">
      {profile?.indexed ? (
        <JsonLd
          data={jsonLdGraph([
            {
              "@type": "ProfilePage",
              url: `${PUBLIC_SITE_ORIGIN}${profilePath(profile.username ?? username)}`,
              mainEntity: {
                "@type": "Organization",
                name: profile.full_name?.trim() || profile.username,
                alternateName: `@${profile.username}`,
                ...(profile.bio ? { description: profile.bio } : {}),
                ...(profile.avatar_public_id
                  ? {
                      image: buildAvatarUrl(
                        profile.avatar_public_id,
                        profile.avatar_version,
                        { width: 400, height: 400 },
                      ),
                    }
                  : {}),
                url: `${PUBLIC_SITE_ORIGIN}${profilePath(profile.username ?? username)}`,
              },
            },
          ])}
        />
      ) : null}
      <Suspense fallback={<ProfileHeaderSkeleton />}>
        <ProfileDetails username={username} />
      </Suspense>

      <section className="flex flex-col w-full gap-10">{children}</section>
    </div>
  );
}
