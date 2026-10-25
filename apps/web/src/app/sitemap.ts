import { publicSupabase } from "@/config/supabase/publicClient";
import { languageUrls } from "@/i18n/alternates";
import { LEGAL_DOCUMENTS, listHelpPages } from "@/utils/publicContent";
import { indexedCities, isIndexedAccount } from "@/utils/searchIndexing";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { buildCloudinaryUrl } from "@abonten/core/cloudinaryUrl";
import { logger } from "@abonten/core/logger";
import {
  cityPath,
  eventPath,
  placePath,
  profilePath,
} from "@abonten/core/seo/paths";
import type { MetadataRoute } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// /sitemap.xml -- every public event and place page, the launched cities'
// Explore pages, the profiles of the people hosting them and the static
// public pages, so search engines find listings without crawling the
// location-based explore pages (which need a geolocation to show anything).
// Each translated page lists its other languages (hreflang, ?hl=<locale>,
// i18n/alternates.ts); the legal pages are English only. Listings carry
// their flyer or cover, for image search.
// Rebuilt at most once an hour. Reads go through the cookie-free anon
// client, so RLS keeps hidden / removed / draft listings out exactly as it
// does for a signed-out visitor; archived and long-ended events are left
// out here, and so are sample listings (utils/searchIndexing.ts).

export const revalidate = 3600;

const MAX_URLS_PER_TYPE = 5000;

type HostRow = { username: string | null; status_id: number | null } | null;

function listingImage(
  publicId: string | null,
  version: string | null,
): string[] | undefined {
  return publicId && version
    ? [buildCloudinaryUrl(publicId, version, { width: 1200, height: 630 })]
    : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = PUBLIC_SITE_ORIGIN;
  const now = new Date();
  const recentCutoff = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${base}/`,
      alternates: { languages: languageUrls(`${base}/`) },
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${base}/weekly`,
      alternates: { languages: languageUrls(`${base}/weekly`) },
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}/help`,
      alternates: { languages: languageUrls(`${base}/help`) },
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${base}/legal`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.2,
    },
    ...Object.keys(LEGAL_DOCUMENTS).map((slug) => ({
      url: `${base}/legal/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.2,
    })),
    ...listHelpPages().map((p) => ({
      url: `${base}${p.href}`,
      alternates: { languages: languageUrls(`${base}${p.href}`) },
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];

  const [events, places, cities] = await Promise.all([
    publicSupabase
      .from("event")
      .select(
        "event_code, organizer_id, created_at, published_at, ends_at, flyer_public_id, flyer_version, user_info!organizer_id(username, status_id)",
      )
      .eq("status", "published")
      .is("archived_at", null)
      .gte("ends_at", recentCutoff)
      .order("ends_at", { ascending: true })
      .limit(MAX_URLS_PER_TYPE),
    publicSupabase
      .from("place")
      .select(
        "slug, owner_id, claimed, updated_at, cover_public_id, cover_version, user_info!owner_id(username, status_id)",
      )
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(MAX_URLS_PER_TYPE),
    indexedCities(),
  ]);

  if (events.error) logger.error(`sitemap events: ${events.error.message}`);
  if (places.error) logger.error(`sitemap places: ${places.error.message}`);

  // A read that failed must not become "there are no events": that sitemap
  // would be served for the next hour. Thrown while the site is running,
  // the hourly rebuild fails and the last good sitemap stays up. During the
  // build itself there is no earlier copy to keep, so the static pages go
  // out alone and the first rebuild fills the rest in.
  const failure = events.error ?? places.error;
  if (failure && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
    throw new Error(`sitemap: ${failure.message}`);
  }

  // A city with nothing listed says noindex (utils/searchIndexing.ts).
  const cityPages: MetadataRoute.Sitemap = cities
    .filter((city) => city.hasListings)
    .map((city) => ({
      url: `${base}${cityPath(city.slug)}`,
      alternates: { languages: languageUrls(`${base}${cityPath(city.slug)}`) },
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    }));

  const eventRows = (events.data ?? []).filter(
    (e) => !!e.event_code && isIndexedAccount(e.organizer_id),
  );
  const eventPages: MetadataRoute.Sitemap = eventRows.map((e) => {
    const url = `${base}${eventPath(e.event_code)}`;
    const changed = e.published_at ?? e.created_at;
    return {
      url,
      alternates: { languages: languageUrls(url) },
      lastModified: changed ? new Date(changed) : now,
      changeFrequency: "daily" as const,
      priority: 0.7,
      images: listingImage(e.flyer_public_id, e.flyer_version),
    };
  });

  const placeRows = (places.data ?? []).filter(
    (p) => !!p.slug && isIndexedAccount(p.owner_id),
  );
  const placePages: MetadataRoute.Sitemap = placeRows.map((p) => {
    const url = `${base}${placePath(p.slug)}`;
    return {
      url,
      alternates: { languages: languageUrls(url) },
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
      images: listingImage(p.cover_public_id, p.cover_version),
    };
  });

  // The hosts of what is listed: organizers of these events and owners who
  // have claimed these places (the profile layout indexes the same people).
  const hosts = new Set<string>();
  const addHost = (host: HostRow) => {
    if (host?.username && host.status_id === 1) hosts.add(host.username);
  };
  for (const e of eventRows) addHost(e.user_info as HostRow);
  for (const p of placeRows) if (p.claimed) addHost(p.user_info as HostRow);
  const profilePages: MetadataRoute.Sitemap = [...hosts].map((username) => {
    const url = `${base}${profilePath(encodeURIComponent(username))}`;
    return {
      url,
      alternates: { languages: languageUrls(url) },
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    };
  });

  return [
    ...staticPages,
    ...cityPages,
    ...eventPages,
    ...placePages,
    ...profilePages,
  ];
}
