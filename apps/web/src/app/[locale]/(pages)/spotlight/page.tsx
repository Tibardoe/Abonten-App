import SpotlightFeed from "@/spotlight/organisms/SpotlightFeed";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// Spotlight: the short-video feed. Everything here is personal (ranking,
// Following, Nearby, the viewer's likes), so it renders on the client after
// the programme check. Nothing is cached per visitor on the server.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("spotlight");
  return {
    title: t("spotlight"),
    description: t("shortVideosFromTheEventsAnd"),
  };
}

export default function SpotlightPage() {
  return (
    <Suspense fallback={null}>
      <SpotlightFeed />
    </Suspense>
  );
}
