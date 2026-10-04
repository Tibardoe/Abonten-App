import { publicSupabase } from "@/config/supabase/publicClient";
import { languageUrls } from "@/i18n/alternates";
import { LEGAL_DOCUMENTS, listHelpPages } from "@/utils/publicContent";
import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { logger } from "@abonten/core/logger";
import type { MetadataRoute } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// /sitemap.xml -- every public event and place page plus the static
// public pages, so search engines find listings without crawling the
// location-based explore pages (which need a geolocation to show anything).
// Each translated page lists its other languages (hreflang, ?hl=<locale>,
// i18n/alternates.ts); the legal pages are English only.
// Rebuilt at most once an hour. Reads go through the cookie-free anon
// client, so RLS keeps hidden / removed / draft listings out exactly as it
// does for a signed-out visitor; archived and long-ended events are left
// out here.

export const revalidate = 3600;

const MAX_URLS_PER_TYPE = 5000;

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

  const [events, places] = await Promise.all([
    publicSupabase
      .from("event")
      .select("event_code, created_at, ends_at")
      .eq("status", "published")
      .is("archived_at", null)
      .gte("ends_at", recentCutoff)
      .order("ends_at", { ascending: true })
      .limit(MAX_URLS_PER_TYPE),
    publicSupabase
      .from("place")
      .select("slug, updated_at")
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(MAX_URLS_PER_TYPE),
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

  const eventPages: MetadataRoute.Sitemap = (events.data ?? [])
    .filter((e) => !!e.event_code)
    .map((e) => ({
      url: `${base}/events/${e.event_code}`,
      alternates: { languages: languageUrls(`${base}/events/${e.event_code}`) },
      lastModified: e.created_at ? new Date(e.created_at) : now,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

  const placePages: MetadataRoute.Sitemap = (places.data ?? [])
    .filter((p) => !!p.slug)
    .map((p) => ({
      url: `${base}/places/${p.slug}`,
      alternates: { languages: languageUrls(`${base}/places/${p.slug}`) },
      lastModified: p.updated_at ? new Date(p.updated_at) : now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));

  return [...staticPages, ...eventPages, ...placePages];
}
