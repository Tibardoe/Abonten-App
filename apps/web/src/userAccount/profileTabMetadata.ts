import { languageAlternates } from "@/i18n/alternates";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

// Each public tab of a profile is its own page (its own canonical address);
// the title, description and whether search engines may show it come from
// the profile layout (user/[username]/layout.tsx).
export type ProfileTab = "posts" | "places" | "reviews" | "spotlight";

export async function profileTabMetadata(
  params: Promise<{ username: string }>,
  tab: ProfileTab,
): Promise<Metadata> {
  const { username } = await params;
  return {
    alternates: languageAlternates(
      `/user/${encodeURIComponent(username)}/${tab}`,
      await getLocale(),
    ),
  };
}

/** Bookings and favourites are the owner's own: never a search result. */
export const PRIVATE_PROFILE_TAB_METADATA: Metadata = {
  robots: { index: false, follow: false },
};
