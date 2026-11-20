import { languageAlternates } from "@/i18n/alternates";
import TeamGuide from "@/teams/organisms/TeamGuide";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

export const dynamic = "force-static";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const t = await getTranslations("teams");
  const { locale } = await params;
  return {
    title: t("guide.metaTitle"),
    description: t("guide.metaDescription"),
    alternates: languageAlternates("/teams", locale),
    // Team accounts open to businesses one by one (beta), so the guide is
    // shared by link and kept out of search results until they open to
    // everyone; then drop this and add the page to the sitemap.
    robots: { index: false, follow: true },
  };
}

export default function TeamsGuidePage() {
  return <TeamGuide />;
}
