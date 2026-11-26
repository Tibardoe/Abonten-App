import { hostDisplayName } from "@abonten/core/hostDisplayName";
import { logger } from "@abonten/core/logger";
import { showcaseRowsToShow } from "@abonten/core/showcase/rules";
import type {
  ShowcaseHostTile,
  ShowcaseNextEvent,
  ShowcasePlaceTile,
  ShowcaseWall,
} from "@abonten/types/showcaseType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  ShowcaseTapInput,
  ShowcaseWallRequest,
} from "@abonten/validation/showcaseSchemas";
import { tr } from "../i18n/requestLocale";
import { checkRateLimit } from "../security/rateLimit";
import { resolveShowcaseAccess } from "./showcaseProgram";

// Reads of the "On Abonten" wall (docs/architecture/showcase.md): the moving
// wall on the website's landing and Explore pages and the app's Explore tab,
// and the still "See all" directory. Every read resolves the programme for
// this caller first, then asks showcase_wall() with the service role, which
// re-checks every entry (account active, an upcoming event, a place someone
// runs) and builds tile fields only for the entries it picked. The rows
// below the programme's minimum are dropped here (core rule), so a thin
// wall is never shown.
//
// A failed read is a 500 envelope, never an empty wall: the screens hide
// the section quietly on a failure and never say "nobody is on Abonten".

type Envelope<T> = { status: number; message?: string; data?: T };

/** The most tiles the directory lists per group. */
const DIRECTORY_LIMIT = 200;

type RawNextEvent = {
  id: string;
  event_code: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
} | null;

type RawHost = {
  entry_id: string;
  subject_id: string;
  username: string | null;
  full_name: string | null;
  username_is_generated: boolean | null;
  avatar_public_id: string | null;
  avatar_version: string | null;
  verified: boolean | null;
  is_team: boolean | null;
  following: boolean | null;
  next_event: RawNextEvent;
};

type RawPlace = {
  entry_id: string;
  subject_id: string;
  owner_id: string;
  name: string;
  slug: string;
  cover_public_id: string | null;
  cover_version: string | null;
  verified: boolean | null;
  category_name: string | null;
  category_slug: string | null;
  area: string | null;
  open_now: boolean | null;
  following: boolean | null;
  next_event: RawNextEvent;
};

type RawWall = {
  countryCode: string | null;
  regionId: string | null;
  regionName: string | null;
  hosts: RawHost[];
  places: RawPlace[];
};

function mapNextEvent(raw: RawNextEvent): ShowcaseNextEvent | null {
  if (!raw) return null;
  return {
    id: raw.id,
    eventCode: raw.event_code,
    title: raw.title,
    startsAt: raw.starts_at,
    endsAt: raw.ends_at,
    timezone: raw.timezone,
  };
}

function mapHost(raw: RawHost): ShowcaseHostTile {
  return {
    kind: "host",
    entryId: raw.entry_id,
    subjectId: raw.subject_id,
    // Deleted accounts never qualify, so the stored name is a real one.
    name: hostDisplayName({
      username: raw.username,
      full_name: raw.full_name,
      username_is_generated: raw.username_is_generated,
    }),
    username: raw.username,
    imagePublicId: raw.avatar_public_id,
    imageVersion: raw.avatar_version,
    verified: !!raw.verified,
    isTeam: !!raw.is_team,
    following: !!raw.following,
    nextEvent: mapNextEvent(raw.next_event),
  };
}

function mapPlace(raw: RawPlace): ShowcasePlaceTile {
  return {
    kind: "place",
    entryId: raw.entry_id,
    subjectId: raw.subject_id,
    ownerId: raw.owner_id,
    name: raw.name,
    slug: raw.slug,
    imagePublicId: raw.cover_public_id,
    imageVersion: raw.cover_version,
    verified: !!raw.verified,
    following: !!raw.following,
    nextEvent: mapNextEvent(raw.next_event),
    openNow: raw.open_now,
    categorySlug: raw.category_slug,
    categoryName: raw.category_name,
    area: raw.area,
  };
}

/** The raw rows, before the minimum-per-row rule. Exported for tests. */
export async function readShowcaseWall(
  supabase: ServiceRoleClient,
  viewerId: string | null,
  input: ShowcaseWallRequest,
  limit: number,
): Promise<ShowcaseWall | null> {
  const { data, error } = await supabase.rpc("showcase_wall", {
    p_lat: input.lat ?? null,
    p_lng: input.lng ?? null,
    p_country_code: input.countryCode ?? null,
    p_viewer: viewerId ?? null,
    p_limit: limit,
  } as never);
  if (error || !data) {
    logger.error(
      `showcase_wall failed: ${error?.message ?? "no answer"} (${error?.code ?? ""})`,
    );
    return null;
  }
  const raw = data as unknown as RawWall;
  return {
    countryCode: raw.countryCode ?? null,
    regionId: raw.regionId ?? null,
    regionName: raw.regionName ?? null,
    // A host is opened by their @username; one without (never expected:
    // every account gets one) has no page to open, so no tile.
    hosts: (raw.hosts ?? []).filter((h) => !!h.username).map(mapHost),
    places: (raw.places ?? []).map(mapPlace),
  };
}

const failed = <T>(): Envelope<T> => ({
  status: 500,
  message: tr("couldnTLoadOnAbonten"),
});

/**
 * The moving wall for this caller and place: data null when it is not on
 * for them or no row has enough entries (the section hides).
 */
export async function getShowcaseWallCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: ShowcaseWallRequest,
): Promise<Envelope<ShowcaseWall | null>> {
  const access = await resolveShowcaseAccess(supabase, userId);
  if (access.failed) return failed();
  if (!access.enabled || !access.settings) return { status: 200, data: null };

  const wall = await readShowcaseWall(
    supabase,
    userId,
    input,
    access.settings.max_per_row,
  );
  if (!wall) return failed();
  const rows = showcaseRowsToShow(wall, access.settings.min_per_row);
  return { status: 200, data: rows ? { ...wall, ...rows } : null };
}

export type ShowcaseDirectory = {
  /** Null: nothing to list yet (no row reaches the minimum). */
  wall: ShowcaseWall | null;
  /** Open to everyone: the page may be indexed. */
  isPublic: boolean;
};

/**
 * "See all": every entry that shows, standing still, in two groups. 404
 * when the wall is not on for this caller. A group appears on the same
 * terms as its row on the wall (the minimum), so the directory never lists
 * what the wall would hide.
 */
export async function getShowcaseDirectoryCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: ShowcaseWallRequest,
): Promise<Envelope<ShowcaseDirectory>> {
  const access = await resolveShowcaseAccess(supabase, userId);
  if (access.failed) return failed();
  if (!access.enabled || !access.settings) {
    return { status: 404, message: tr("notFound") };
  }
  const wall = await readShowcaseWall(supabase, userId, input, DIRECTORY_LIMIT);
  if (!wall) return failed();
  const rows = showcaseRowsToShow(wall, access.settings.min_per_row);
  return {
    status: 200,
    data: {
      wall: rows ? { ...wall, ...rows } : null,
      isPublic: access.isPublic,
    },
  };
}

/** A viewer key for counting: the account, else the address (never stored). */
function viewerKey(userId: string | null, ip: string | null): string | null {
  if (userId) return `u:${userId}`;
  if (ip && ip !== "unknown") return `ip:${ip}`;
  return null;
}

/**
 * Count a tap on a tile (the tile opens the profile or place page by
 * itself; this only counts). Counted once an hour per viewer and entry, and
 * only while the wall is on for this caller. Always answers 200 unless the
 * caller is going too fast: counting must never get in anyone's way.
 */
export async function recordShowcaseTapCore(
  supabase: ServiceRoleClient,
  userId: string | null,
  input: ShowcaseTapInput,
  meta: { ip?: string | null } = {},
): Promise<Envelope<{ counted: boolean }>> {
  const access = await resolveShowcaseAccess(supabase, userId);
  if (!access.enabled) return { status: 200, data: { counted: false } };

  const key = viewerKey(userId, meta.ip ?? null);
  if (!key) return { status: 200, data: { counted: false } };
  if (!(await checkRateLimit(`showcase-taps:${key}`, 120, 3600))) {
    return { status: 429, message: tr("tooManyRequestsPleaseTryAgain") };
  }
  if (
    !(await checkRateLimit(`showcase-tap:${key}:${input.entryId}`, 1, 3600))
  ) {
    return { status: 200, data: { counted: false } };
  }
  const { data, error } = await supabase.rpc("showcase_count", {
    p_entry_id: input.entryId,
    p_kind: "tap",
    p_target_kind: null,
    p_target_id: null,
  } as never);
  if (error) {
    logger.error(`showcase tap count failed: ${error.message}`);
    return { status: 200, data: { counted: false } };
  }
  return { status: 200, data: { counted: data === true } };
}

/**
 * Count a follow made from a tile. Called by the follow service only after
 * it inserted a NEW follow row, so a follow is counted once however often
 * the button is pressed; the database counts it only when the entry is for
 * the followed account or place. Once a day per person and entry, so
 * unfollowing and following again does not count twice. Never fails the
 * follow.
 */
export async function recordShowcaseFollow(
  supabase: ServiceRoleClient,
  userId: string,
  input: {
    entryId: string;
    targetKind: "organizer" | "place";
    targetId: string;
  },
): Promise<boolean> {
  try {
    if (
      !(await checkRateLimit(
        `showcase-follow:${userId}:${input.entryId}`,
        1,
        86_400,
      ))
    ) {
      return false;
    }
    const { data, error } = await supabase.rpc("showcase_count", {
      p_entry_id: input.entryId,
      p_kind: "follow",
      p_target_kind: input.targetKind,
      p_target_id: input.targetId,
    } as never);
    if (error) {
      logger.error(`showcase follow count failed: ${error.message}`);
      return false;
    }
    return data === true;
  } catch (error) {
    logger.error("showcase follow count failed", error);
    return false;
  }
}
