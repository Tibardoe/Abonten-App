import { languageAlternates } from "@/i18n/alternates";
import ShowcaseDirectory from "@/showcase/organisms/ShowcaseDirectory";
import { resolveDiscoveryCaller } from "@/utils/discoveryAction";
import { getShowcaseDirectoryCore } from "@abonten/services/showcase/showcaseWallCore";
import { showcaseWallRequestSchema } from "@abonten/validation/showcaseSchemas";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { cache } from "react";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
// export const instant = false;

// "See all" of the "On Abonten" wall (docs/architecture/showcase.md): every
// host and place that shows on it, standing still, in two groups. Rendered
// for every request: the tiles carry the visitor's own follow state, so the
// page is never cached for others. 404 while the programme is off for the
// visitor; kept out of search results until it is open to everyone. A read
// that failed is an error page, never a "not found".
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ lat?: string; lng?: string }>;

const loadDirectory = cache(async (lat?: string, lng?: string) => {
  const input = showcaseWallRequestSchema.safeParse({ lat, lng });
  const caller = await resolveDiscoveryCaller();
  return getShowcaseDirectoryCore(
    caller.svc,
    caller.userId,
    input.success ? input.data : {},
  );
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ locale }, { lat, lng }, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("showcase"),
  ]);
  const res = await loadDirectory(lat, lng);
  const indexable = res.status === 200 && !!res.data?.isPublic;
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: languageAlternates("/on-abonten", locale),
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function OnAbontenPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { lat, lng } = await searchParams;
  const res = await loadDirectory(lat, lng);
  if (res.status === 404) notFound();
  if (res.status !== 200 || !res.data) {
    throw new Error(`showcase directory read failed (${res.status})`);
  }
  return <ShowcaseDirectory wall={res.data.wall} />;
}
