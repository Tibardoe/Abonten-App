import { logger } from "@abonten/core/logger";
import { weeklyBannerSlides } from "@abonten/core/weekly/bannerSlides";
import { weeklyEditionPath } from "@abonten/core/weekly/copy";
import { weekEndFor, weekStartFor } from "@abonten/core/weekly/week";
import type { UserPostType } from "@abonten/types/postsType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  WeeklyEditionResult,
  WeeklyScopeResolution,
  WeeklyTeaser,
} from "@abonten/types/weeklyType";
import type {
  WeeklyEditionRequest,
  WeeklyTeaserRequest,
} from "@abonten/validation/weeklySchemas";
import { mapWeeklyDocument } from "./weeklyDocument";
import { resolveWeeklyAccess } from "./weeklyProgram";

// Public reads of Abonten Weekly: the edition page (web /weekly routes and
// GET /api/mobile/weekly) and the Explore teaser. Every read first resolves
// the programme for this visitor, then calls weekly_edition_view() with the
// service role. Nothing here writes.

type Envelope<T> = { status: number; message?: string; data?: T };

export type WeeklyEditionResponse = WeeklyEditionResult & {
  /**
   * "public" when the answer is the same for every visitor (the programme is
   * open to all, or closed to all) and may be cached by a CDN; "personal"
   * when it depends on who is asking (staff or beta audience).
   */
  visibility: "public" | "personal";
};

// Geographic centre of Ghana and a radius that covers the whole country,
// used only for the "happening this week" block when no edition is out.
const GHANA_CENTRE = { lat: 7.9465, lng: -1.0232, radiusKm: 450 };
const FALLBACK_EVENT_LIMIT = 12;

const closed = (
  visibility: WeeklyEditionResponse["visibility"],
): WeeklyEditionResponse => ({
  available: false,
  edition: null,
  fallbackEvents: [],
  visibility,
});

export async function resolveWeeklyScopeCore(
  supabase: ServiceRoleClient,
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<WeeklyScopeResolution | null> {
  const { data, error } = await supabase.rpc("weekly_resolve_scope", {
    p_lat: lat ?? (null as unknown as number),
    p_lng: lng ?? (null as unknown as number),
  });
  if (error) {
    logger.error(`weekly_resolve_scope failed: ${error.message}`);
    return null;
  }
  const row = data?.[0];
  return row
    ? { slug: row.slug, name: row.name, isNational: row.is_national }
    : null;
}

async function fallbackEvents(
  supabase: ServiceRoleClient,
  scopeSlug: string | null,
  now: Date,
): Promise<{ events: UserPostType[]; scopeFound: boolean }> {
  let centre = GHANA_CENTRE;
  let scopeFound = true;
  if (scopeSlug) {
    const { data: scope } = await supabase
      .from("weekly_scope")
      .select("centre_lat, centre_lng, radius_km, status")
      .eq("slug", scopeSlug)
      .maybeSingle();
    if (!scope || scope.status !== "active") {
      scopeFound = false;
    } else if (scope.centre_lat != null && scope.centre_lng != null) {
      centre = {
        lat: scope.centre_lat,
        lng: scope.centre_lng,
        radiusKm: Number(scope.radius_km ?? GHANA_CENTRE.radiusKm),
      };
    }
  }
  if (!scopeFound) return { events: [], scopeFound };

  const weekEnd = new Date(`${weekEndFor(weekStartFor(now))}T23:59:59.999Z`);
  const { data, error } = await supabase.rpc("get_events_in_window", {
    p_user_lat: centre.lat,
    p_user_lng: centre.lng,
    p_radius_km: centre.radiusKm,
    p_window_start: now.toISOString(),
    p_window_end: weekEnd.toISOString(),
    p_page_size: FALLBACK_EVENT_LIMIT,
  });
  if (error) {
    logger.error(`weekly fallback events failed: ${error.message}`);
    return { events: [], scopeFound };
  }
  const events = ((data ?? []) as unknown as UserPostType[])
    .slice(0, FALLBACK_EVENT_LIMIT)
    .map((event) => ({
      ...event,
      attendanceCount: Number(event.attendance_count ?? 0) || 0,
    }));
  return { events, scopeFound };
}

/**
 * The edition a visitor asked for. `input.week` picks an exact past or
 * current edition (404 when it is not published); otherwise the current
 * edition for `input.scope`, or for the scope containing `lat`/`lng`, or
 * Ghana-wide.
 */
export async function getWeeklyEditionCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: WeeklyEditionRequest,
  options: { now?: Date } = {},
): Promise<Envelope<WeeklyEditionResponse>> {
  const now = options.now ?? new Date();
  try {
    const access = await resolveWeeklyAccess(supabase, userId);
    const visibility = access.isPublic ? "public" : "personal";
    if (!access.program.enabled) {
      return { status: 200, data: closed(visibility) };
    }

    let scopeSlug = input.scope ?? null;
    if (!scopeSlug && input.lat != null && input.lng != null) {
      scopeSlug =
        (await resolveWeeklyScopeCore(supabase, input.lat, input.lng))?.slug ??
        null;
    }

    const { data, error } = await supabase.rpc("weekly_edition_view", {
      p_scope_slug: scopeSlug as string,
      p_week_start: input.week,
      p_as_of: now.toISOString(),
    });
    if (error) {
      logger.error(`weekly_edition_view failed: ${error.message}`);
      return { status: 500, message: "Couldn't load Abonten Weekly." };
    }

    const edition = mapWeeklyDocument(data);
    if (edition) {
      return {
        status: 200,
        data: { available: true, edition, fallbackEvents: [], visibility },
      };
    }

    if (input.week) {
      return {
        status: 404,
        message: "This edition of Abonten Weekly is not available.",
        data: {
          available: true,
          edition: null,
          fallbackEvents: [],
          visibility,
        },
      };
    }

    const fallback = await fallbackEvents(supabase, scopeSlug, now);
    if (!fallback.scopeFound) {
      return {
        status: 404,
        message: "Abonten Weekly is not available for this area.",
        data: {
          available: true,
          edition: null,
          fallbackEvents: [],
          visibility,
        },
      };
    }
    return {
      status: 200,
      data: {
        available: true,
        edition: null,
        fallbackEvents: fallback.events,
        visibility,
      },
    };
  } catch (error) {
    logger.error("getWeeklyEditionCore failed", error);
    return { status: 500, message: "Couldn't load Abonten Weekly." };
  }
}

/**
 * The small "Abonten Weekly" card on Explore. Null when the programme or the
 * teaser is off for this visitor, when nothing is published, or when only
 * last week's edition is out (the teaser always means this week).
 */
export async function getWeeklyTeaserCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: WeeklyTeaserRequest,
  options: { now?: Date } = {},
): Promise<Envelope<WeeklyTeaser | null>> {
  try {
    const access = await resolveWeeklyAccess(supabase, userId);
    if (!access.program.teaser) return { status: 200, data: null };

    const result = await getWeeklyEditionCore(
      supabase,
      userId,
      { lat: input.lat, lng: input.lng },
      options,
    );
    const doc = result.data?.edition;
    if (result.status !== 200 || !doc || doc.isPreviousWeek) {
      return { status: result.status === 500 ? 500 : 200, data: null };
    }

    const items = doc.sections.flatMap((s) => s.items);
    const slides = weeklyBannerSlides(doc.sections);
    // Older app builds still read `images`; they show the first two or three.
    const images: WeeklyTeaser["images"] = slides.slice(0, 3).map((s) => ({
      publicId: s.publicId,
      version: s.version,
      alt: s.title,
    }));

    return {
      status: 200,
      data: {
        scopeSlug: doc.edition.scopeSlug,
        scopeName: doc.edition.scopeName,
        weekStart: doc.edition.weekStart,
        title: doc.edition.title,
        subtitle: doc.edition.subtitle,
        isFallbackScope: doc.isFallbackScope,
        itemCount: items.length,
        images,
        slides,
        href: weeklyEditionPath(doc.edition.scopeSlug, doc.edition.weekStart),
      },
    };
  } catch (error) {
    logger.error("getWeeklyTeaserCore failed", error);
    return { status: 200, data: null };
  }
}
