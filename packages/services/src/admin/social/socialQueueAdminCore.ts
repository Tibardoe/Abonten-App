import { PUBLIC_SITE_ORIGIN } from "@abonten/core/brand/socialLinks";
import { placeCategoryLabel } from "@abonten/core/categoryLabels";
import {
  formatSingleDateTime,
  getFormattedEventDate,
} from "@abonten/core/dateFormatter";
import { readEventAddress } from "@abonten/core/eventAddress";
import { formatMoney } from "@abonten/core/formatMoney";
import { formatDate, formatDateRange } from "@abonten/core/i18n/format";
import { logger } from "@abonten/core/logger";
import { foldSearchText } from "@abonten/core/search/foldSearchText";
import { cityPath, eventPath, placePath } from "@abonten/core/seo/paths";
import {
  eventShareOffer,
  shareImageFileName,
  shareImagePath,
} from "@abonten/core/shareKit/shareKit";
import { APP_OPEN_PARAM, appOpenTarget } from "@abonten/core/social/appLinks";
import {
  LINK_SOURCE_PARAM,
  withLinkSource,
} from "@abonten/core/social/linkSources";
import {
  type ListerHandle,
  readListerHandles,
} from "@abonten/core/social/listerSocialLinks";
import {
  ROUNDUP_CITY,
  type Roundup,
  parseRoundupKey,
  roundupCoverFileName,
  roundupCoverPath,
} from "@abonten/core/social/roundups";
import {
  SOCIAL_CHANNEL_SOURCE,
  type SocialChannel,
  type SocialPostStatus,
  socialChannelImageFormat,
} from "@abonten/core/social/socialChannels";
import {
  addCalendarDays,
  instantToWallClock,
  startOfCalendarDay,
} from "@abonten/core/time";
import { coreTranslator } from "@abonten/i18n/server";
import type { AdminContext } from "@abonten/types/adminTypes";
import type {
  SocialQueueDay,
  SocialQueueImage,
  SocialQueueItem,
  SocialQueueLister,
  SocialQueueSettings,
  SocialQueueSubject,
  SocialQueueView,
} from "@abonten/types/socialQueueType";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type {
  SocialPostStatusInput,
  SocialQueueSettingsInput,
} from "@abonten/validation/adminSchemas";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";
import {
  type CaptionCredit,
  type EventCaptionFacts,
  type RoundupCaptionEvent,
  eventCaption,
  instagramListerTip,
  placeCaption,
  roundupCaption,
  xWeightedLength,
} from "./socialCaptions";

// Admin › Social (docs/admin/social.md): the posting queue for Abonten's
// own Instagram, X and WhatsApp Channel. The jobs social_queue_listings()
// and social_queue_roundup() decide WHAT to post (social_post rows); this
// module computes everything else when the queue is read, so it always
// matches the listing as it is now: the caption per channel, the link tagged
// with the channel's `?src=` code, the share-kit images, the lister's own
// social accounts (credited on X and named in the Instagram tip) and a
// roundup's video frames. Marking a post posted or skipped, and changing the
// settings, are audited.

type RequestMeta = Record<string, unknown> | undefined;

const denied = <T>(e: unknown): AdminEnvelope<T> =>
  adminError(e) as AdminEnvelope<T>;

/** Rows one page of the queue shows at most. */
const PAGE_ROWS = 300;
/** How far back the Posted and Skipped tabs look. */
const HISTORY_DAYS = 30;
/** Images an X post carries at most. */
const X_IMAGES = 4;

const CAPTION_LOCALE = "en";

/** Where share images are fetched from: this environment's website. */
function webBase(): string {
  return (process.env.WEB_BASE_URL || PUBLIC_SITE_ORIGIN).replace(/\/+$/, "");
}

/** A public link as posted: always the public address, tagged. */
function tagged(path: string, channel: SocialChannel): string {
  return withLinkSource(
    `${PUBLIC_SITE_ORIGIN}${path}`,
    SOCIAL_CHANNEL_SOURCE[channel],
  );
}

/**
 * "Get the app" for a post. For an event or a place it names the listing
 * (/go/app?open=/events/<code>&src=wa): an Android phone without the app
 * installs from Google Play and then opens that listing
 * (@abonten/core/social/appLinks). "/" stays readable, as a query allows.
 * A roundup has no one listing: the plain link.
 */
function appLinkFor(path: string, channel: SocialChannel): string {
  const target = appOpenTarget(path);
  if (!target) return tagged("/go/app", channel);
  return `${PUBLIC_SITE_ORIGIN}/go/app?${APP_OPEN_PARAM}=${target.path}&${LINK_SOURCE_PARAM}=${SOCIAL_CHANNEL_SOURCE[channel]}`;
}

type PostRow = {
  id: string;
  subject_kind: "event" | "place" | "roundup";
  subject_key: string;
  event_id: string | null;
  place_id: string | null;
  roundup_key: string | null;
  event_ids: string[];
  channel: SocialChannel;
  status: SocialPostStatus;
  queued_on: string;
  created_at: string;
  posted_at: string | null;
  posted_by: string | null;
  note: string | null;
  updated_at: string;
  updated_by: string | null;
};

type EventRow = {
  id: string;
  event_code: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  address: unknown;
  country_code: string;
  status: string;
  archived_at: string | null;
  postponed_at: string | null;
  moderation_state: string | null;
  place: { name: string | null; social_links: unknown } | null;
  organizer: OrganizerRow | null;
  event_occurrence: { starts_at: string; ends_at: string }[] | null;
  ticket_type: {
    type: string | null;
    price: number | string | null;
    currency: string | null;
  }[];
};

type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  address: unknown;
  country_code: string;
  status: string;
  moderation_state: string | null;
  temporary_status: string | null;
  social_links: unknown;
  place_category: { name: string | null; slug: string | null } | null;
};

type OrganizerRow = {
  id: string;
  username: string | null;
  full_name: string | null;
  social_links: unknown;
};

const POST_COLUMNS =
  "id, subject_kind, subject_key, event_id, place_id, roundup_key, event_ids, channel, status, queued_on, created_at, posted_at, posted_by, note, updated_at, updated_by";
const EVENT_COLUMNS =
  "id, event_code, title, starts_at, ends_at, timezone, address, country_code, status, archived_at, postponed_at, moderation_state, place:place_id(name, social_links), organizer:organizer_id(id, username, full_name, social_links), event_occurrence(starts_at, ends_at), ticket_type(type, price, currency)";
const PLACE_COLUMNS =
  "id, slug, name, address, country_code, status, moderation_state, temporary_status, social_links, place_category(name, slug)";

/** "Spintex Road, Accra, Ghana" → "Spintex Road, Accra". */
function shortAddress(full: string): string {
  return full
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
}

/** The default market's zone: the queue's days are its days. */
async function queueTimeZone(supabase: ServiceRoleClient): Promise<string> {
  const { data } = await supabase
    .from("market")
    .select("default_timezone")
    .eq("is_default", true)
    .maybeSingle();
  return data?.default_timezone ?? "UTC";
}

/** City names per country, longest first, for hashtags. */
async function cityNames(
  supabase: ServiceRoleClient,
): Promise<Map<string, { name: string; folded: string }[]>> {
  const { data, error } = await supabase
    .from("market_region")
    .select("name, country_code")
    .eq("kind", "city")
    .eq("status", "active");
  const out = new Map<string, { name: string; folded: string }[]>();
  if (error) {
    logger.warn(`social queue: city names unavailable: ${error.message}`);
    return out;
  }
  for (const r of data ?? []) {
    const list = out.get(r.country_code) ?? [];
    list.push({ name: r.name, folded: foldSearchText(r.name) });
    out.set(r.country_code, list);
  }
  for (const list of out.values()) {
    list.sort((a, b) => b.folded.length - a.folded.length);
  }
  return out;
}

function cityIn(
  cities: Map<string, { name: string; folded: string }[]>,
  countryCode: string,
  address: string,
): string | null {
  const text = foldSearchText(address);
  return (
    cities.get(countryCode)?.find((c) => c.folded && text.includes(c.folded))
      ?.name ?? null
  );
}

/** The event's next date that has not ended (its first one when all have). */
function nextDate(
  e: EventRow,
  now: number,
): { starts: string | null; ends: string | null } {
  const dates = [...(e.event_occurrence ?? [])].sort((a, b) =>
    a.starts_at.localeCompare(b.starts_at),
  );
  if (dates.length > 0) {
    const next = dates.find((d) => Date.parse(d.ends_at) > now) ?? dates[0];
    return { starts: next.starts_at, ends: next.ends_at };
  }
  return { starts: e.starts_at, ends: e.ends_at };
}

function eventIsPublic(e: EventRow): boolean {
  return (
    e.status === "published" &&
    !e.archived_at &&
    !e.postponed_at &&
    (e.moderation_state ?? "visible") === "visible"
  );
}

function eventWarning(e: EventRow | undefined, now: number): string | null {
  if (!e) return "This event was deleted.";
  if (e.status === "canceled") return "This event was cancelled.";
  if (e.postponed_at) return "This event was postponed.";
  if (!eventIsPublic(e)) return "This event is no longer public.";
  const { starts, ends } = nextDate(e, now);
  if (ends && Date.parse(ends) <= now) return "This event has ended.";
  if (starts && Date.parse(starts) <= now) return "This event has started.";
  return null;
}

function placeWarning(p: PlaceRow | undefined): string | null {
  if (!p) return "This place was deleted.";
  if (p.temporary_status === "permanently_closed") {
    return "This place has closed for good.";
  }
  if (p.temporary_status === "temporarily_closed") {
    return "This place is closed for now.";
  }
  if (
    p.status !== "published" ||
    (p.moderation_state ?? "visible") !== "visible"
  ) {
    return "This place is no longer public.";
  }
  return null;
}

/** "Tickets from GH₵50", "Free entry" or nothing, like the share kit. */
function eventFacts(
  e: EventRow,
  city: string | null,
): EventCaptionFacts & { venue: string | null } {
  const { date, time } = getFormattedEventDate(
    e.starts_at,
    e.ends_at,
    e.event_occurrence ?? [],
    e.timezone,
    CAPTION_LOCALE,
  );
  const offer = eventShareOffer(e.ticket_type ?? []);
  const price =
    offer.kind === "tickets"
      ? `${offer.single ? "Tickets" : "Tickets from"} ${formatMoney(
          offer.currency,
          offer.fromAmount,
          { locale: CAPTION_LOCALE, trimZeroFraction: true },
        )}`
      : offer.kind === "free"
        ? "Free entry"
        : null;
  const venue =
    e.place?.name || shortAddress(readEventAddress(e.address).full_address);
  return {
    title: e.title,
    when: time ? `${date} · ${time}` : date,
    venue: venue || null,
    price,
    offer: offer.kind,
    city,
  };
}

function listingImage(
  kind: "events" | "places",
  key: string,
  format: "story" | "post",
  label: string,
): SocialQueueImage {
  return {
    kind,
    key: kind === "events" ? key.toLowerCase() : key,
    format,
    url: `${webBase()}${shareImagePath(kind, key, format, CAPTION_LOCALE)}`,
    fileName: shareImageFileName(key, format),
    label,
  };
}

/**
 * Whose accounts an event credits: its organizer's, or, when the organizer
 * has none on their profile, its venue's. Handles are only those the
 * profile's links name (never guessed from a name).
 */
function eventLister(e: EventRow): SocialQueueLister {
  const organizer = e.organizer;
  const own = readListerHandles(organizer?.social_links);
  // Their name, not their Abonten username: an "@" here would read as a
  // social handle to tag, which it is not.
  const organizerName = organizer
    ? organizer.full_name ||
      (organizer.username ? `${organizer.username} (on Abonten)` : null)
    : null;
  if (own.length > 0 || !e.place) {
    return { source: "organizer", name: organizerName, handles: own };
  }
  const venue = readListerHandles(e.place.social_links);
  return venue.length > 0
    ? { source: "venue", name: e.place.name, handles: venue }
    : { source: "organizer", name: organizerName, handles: [] };
}

function placeLister(p: PlaceRow): SocialQueueLister {
  return {
    source: "place",
    name: p.name,
    handles: readListerHandles(p.social_links),
  };
}

function handleOn(
  lister: SocialQueueLister | null,
  network: ListerHandle["network"],
): string | null {
  return lister?.handles.find((h) => h.network === network)?.handle ?? null;
}

/** What a listing's captions credit, and the Instagram tip, per channel. */
function creditFor(lister: SocialQueueLister | null): {
  credit: CaptionCredit;
  tip: (channel: SocialChannel) => string | null;
} {
  const instagram = handleOn(lister, "instagram");
  return {
    credit: { x: handleOn(lister, "x") },
    tip: (channel) =>
      channel === "ig_story" || channel === "ig_feed"
        ? instagramListerTip(instagram)
        : null,
  };
}

function coverImage(roundup: Roundup): SocialQueueImage {
  return {
    kind: "roundups",
    key: roundup.slug,
    format: "cover",
    url: `${webBase()}${roundupCoverPath(roundup, CAPTION_LOCALE)}`,
    fileName: roundupCoverFileName(roundup),
    label: "Cover",
  };
}

/** The event's date inside a roundup's window, short: "Fri 27 Nov, 8:00 PM". */
function roundupWhen(
  e: EventRow,
  windowStart: number,
  windowEnd: number,
  now: number,
): string {
  const dates = (e.event_occurrence ?? []).length
    ? [...(e.event_occurrence ?? [])].sort((a, b) =>
        a.starts_at.localeCompare(b.starts_at),
      )
    : e.starts_at
      ? [{ starts_at: e.starts_at, ends_at: e.ends_at ?? e.starts_at }]
      : [];
  const inWindow =
    dates.find(
      (d) =>
        Date.parse(d.ends_at) > Math.max(now, windowStart) &&
        Date.parse(d.starts_at) < windowEnd,
    ) ?? dates[0];
  if (!inWindow) return "";
  const day = formatDate(inWindow.starts_at, CAPTION_LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: e.timezone,
  });
  const { time } = formatSingleDateTime(
    inWindow.starts_at,
    e.timezone,
    CAPTION_LOCALE,
  );
  return `${day}, ${time}`;
}

function captionOf(
  row: PostRow,
  build: (links: { link: string; appLink: string }) => string,
  path: string,
): { caption: string; link: string; xLength: number | null } {
  const link = tagged(path, row.channel);
  const caption = build({ link, appLink: appLinkFor(path, row.channel) });
  return {
    caption,
    link,
    xLength: row.channel === "x" ? xWeightedLength(caption) : null,
  };
}

function baseItem(
  row: PostRow,
  people: Map<string, string>,
): Omit<SocialQueueItem, "caption" | "link" | "xLength" | "images"> {
  const decider = row.status === "posted" ? row.posted_by : row.updated_by;
  return {
    id: row.id,
    channel: row.channel,
    status: row.status,
    listerTip: null,
    postedAt: row.posted_at,
    decidedBy: decider
      ? { id: decider, label: people.get(decider) ?? decider.slice(0, 8) }
      : null,
    decidedAt: row.status === "pending" ? null : row.updated_at,
    note: row.note,
  };
}

/**
 * The queue, one tab at a time (pending, posted or skipped), optionally one
 * channel: days newest first (today's first in the Pending tab), each day's
 * listings in the order they were queued, each listing with one item per
 * channel.
 */
export async function listSocialQueueCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  filter: { status?: SocialPostStatus; channel?: SocialChannel | null } = {},
): Promise<AdminEnvelope<SocialQueueView>> {
  try {
    assertPermission(ctx, "social.view");
  } catch (e) {
    return denied(e);
  }
  const status = filter.status ?? "pending";
  const zone = await queueTimeZone(supabase);
  const nowMs = Date.now();
  const today = instantToWallClock(new Date(nowMs), zone).date;

  let query = supabase
    .from("social_post")
    .select(POST_COLUMNS)
    .eq("status", status)
    .order("queued_on", { ascending: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(PAGE_ROWS + 1);
  if (filter.channel) query = query.eq("channel", filter.channel);
  if (status !== "pending") {
    query = query.gte("queued_on", addCalendarDays(today, -HISTORY_DAYS));
  }
  const [{ data, error }, ...counted] = await Promise.all([
    query,
    ...(["pending", "posted", "skipped"] as const).map((s) =>
      supabase
        .from("social_post")
        .select("id", { count: "exact", head: true })
        .eq("status", s),
    ),
  ]);
  if (error) {
    logger.error(`listSocialQueueCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't load the queue." };
  }
  const all = (data ?? []) as unknown as PostRow[];
  const truncated = all.length > PAGE_ROWS;
  const rows = all.slice(0, PAGE_ROWS);

  const eventIds = new Set<string>();
  const placeIds = new Set<string>();
  const peopleIds = new Set<string>();
  for (const r of rows) {
    if (r.event_id) eventIds.add(r.event_id);
    if (r.place_id) placeIds.add(r.place_id);
    for (const id of r.event_ids ?? []) eventIds.add(id);
    if (r.posted_by) peopleIds.add(r.posted_by);
    if (r.updated_by) peopleIds.add(r.updated_by);
  }

  const [events, places, people, cities] = await Promise.all([
    eventIds.size
      ? supabase
          .from("event")
          .select(EVENT_COLUMNS)
          .in("id", [...eventIds])
      : Promise.resolve({ data: [], error: null }),
    placeIds.size
      ? supabase
          .from("place")
          .select(PLACE_COLUMNS)
          .in("id", [...placeIds])
      : Promise.resolve({ data: [], error: null }),
    peopleIds.size
      ? supabase
          .from("user_info")
          .select("id, username, full_name")
          .in("id", [...peopleIds])
      : Promise.resolve({ data: [], error: null }),
    cityNames(supabase),
  ]);
  if (events.error || places.error) {
    logger.error(
      `listSocialQueueCore listings failed: ${events.error?.message ?? places.error?.message}`,
    );
    return { status: 500, message: "Couldn't load the queued listings." };
  }
  const eventById = new Map(
    ((events.data ?? []) as unknown as EventRow[]).map((e) => [e.id, e]),
  );
  const placeById = new Map(
    ((places.data ?? []) as unknown as PlaceRow[]).map((p) => [p.id, p]),
  );
  const peopleById = new Map(
    (people.data ?? []).map((p) => [
      p.id,
      p.username ? `@${p.username}` : (p.full_name ?? p.id.slice(0, 8)),
    ]),
  );
  const categoryT = coreTranslator(CAPTION_LOCALE);

  const subjects = new Map<string, SocialQueueSubject & { day: string }>();
  for (const row of rows) {
    const subjectId = `${row.queued_on}|${row.subject_key}`;
    let subject = subjects.get(subjectId);
    let item: SocialQueueItem | null = null;
    const base = baseItem(row, peopleById);

    if (row.subject_kind === "event" && row.event_id) {
      const e = eventById.get(row.event_id);
      if (!subject) {
        subject = {
          day: row.queued_on,
          key: row.subject_key,
          kind: "event",
          title: e?.title ?? "Deleted event",
          subtitle: null,
          adminHref: `/events/${row.event_id}`,
          publicUrl: e ? `${PUBLIC_SITE_ORIGIN}${eventPath(e.event_code)}` : "",
          warning: eventWarning(e, nowMs),
          lister: e ? eventLister(e) : null,
          reel: null,
          items: [],
        };
        subjects.set(subjectId, subject);
      }
      if (e) {
        const { credit, tip } = creditFor(subject.lister);
        const city = cityIn(
          cities,
          e.country_code,
          readEventAddress(e.address).full_address,
        );
        const facts = eventFacts(e, city);
        subject.subtitle = [facts.when, facts.venue]
          .filter(Boolean)
          .join(" · ");
        const format = socialChannelImageFormat(row.channel);
        item = {
          ...base,
          listerTip: tip(row.channel),
          ...captionOf(
            row,
            (links) => eventCaption(row.channel, facts, links, credit),
            eventPath(e.event_code),
          ),
          images: [
            listingImage(
              "events",
              e.event_code,
              format,
              format === "story" ? "Story" : "Post",
            ),
          ],
        };
      }
    } else if (row.subject_kind === "place" && row.place_id) {
      const p = placeById.get(row.place_id);
      if (!subject) {
        subject = {
          day: row.queued_on,
          key: row.subject_key,
          kind: "place",
          title: p?.name ?? "Deleted place",
          subtitle: null,
          adminHref: `/places/${row.place_id}`,
          publicUrl: p ? `${PUBLIC_SITE_ORIGIN}${placePath(p.slug)}` : "",
          warning: placeWarning(p),
          lister: p ? placeLister(p) : null,
          reel: null,
          items: [],
        };
        subjects.set(subjectId, subject);
      }
      if (p) {
        const { credit, tip } = creditFor(subject.lister);
        const fullAddress = readEventAddress(p.address).full_address;
        const facts = {
          name: p.name,
          category: p.place_category
            ? placeCategoryLabel(categoryT, p.place_category) || null
            : null,
          area: shortAddress(fullAddress) || null,
          city: cityIn(cities, p.country_code, fullAddress),
        };
        subject.subtitle =
          [facts.category, facts.area].filter(Boolean).join(" · ") || null;
        const format = socialChannelImageFormat(row.channel);
        item = {
          ...base,
          listerTip: tip(row.channel),
          ...captionOf(
            row,
            (links) => placeCaption(row.channel, facts, links, credit),
            placePath(p.slug),
          ),
          images: [
            listingImage(
              "places",
              p.slug,
              format,
              format === "story" ? "Story" : "Post",
            ),
          ],
        };
      }
    } else if (row.subject_kind === "roundup" && row.roundup_key) {
      const roundup = parseRoundupKey(row.roundup_key);
      if (!roundup) continue;
      const windowStart =
        startOfCalendarDay(roundup.start, zone)?.getTime() ?? 0;
      const windowEnd =
        startOfCalendarDay(addCalendarDays(roundup.end, 1), zone)?.getTime() ??
        0;
      // Events that left since (cancelled, hidden, ended) drop out.
      const listed = (row.event_ids ?? [])
        .map((id) => eventById.get(id))
        .filter((e): e is EventRow => !!e && eventIsPublic(e))
        .filter((e) => {
          const { ends } = nextDate(e, nowMs);
          return !ends || Date.parse(ends) > nowMs;
        });
      const dropped = (row.event_ids ?? []).length - listed.length;
      const dates = formatDateRange(
        `${roundup.start}T00:00:00Z`,
        `${roundup.end}T00:00:00Z`,
        CAPTION_LOCALE,
        { day: "numeric", month: "short", timeZone: "UTC" },
      );
      if (!subject) {
        subject = {
          day: row.queued_on,
          key: row.subject_key,
          kind: "roundup",
          title:
            roundup.kind === "week"
              ? `What's on in ${ROUNDUP_CITY.name} this week`
              : `This weekend in ${ROUNDUP_CITY.name}`,
          subtitle: `${dates} · ${listed.length} event${listed.length === 1 ? "" : "s"}`,
          adminHref: null,
          publicUrl: `${PUBLIC_SITE_ORIGIN}${cityPath(ROUNDUP_CITY.slug)}`,
          warning:
            windowEnd <= nowMs
              ? "This roundup's days are over."
              : listed.length === 0
                ? "None of its events is still on."
                : dropped > 0
                  ? `${dropped} of its events ${dropped === 1 ? "is" : "are"} no longer on and ${dropped === 1 ? "was" : "were"} left out.`
                  : null,
          lister: null,
          // The vertical video (Reel / TikTok): the cover, then each listed
          // event's 9:16 Story picture, drawn in the browser.
          reel:
            listed.length > 0
              ? {
                  fileBase: `abonten-${roundup.slug}-reel`,
                  frames: [
                    coverImage(roundup),
                    ...listed.map((e) =>
                      listingImage("events", e.event_code, "story", e.title),
                    ),
                  ],
                }
              : null,
          items: [],
        };
        subjects.set(subjectId, subject);
      }
      const captionEvents: RoundupCaptionEvent[] = listed.map((e) => ({
        title: e.title,
        when: roundupWhen(e, windowStart, windowEnd, nowMs),
        venue:
          e.place?.name ||
          shortAddress(readEventAddress(e.address).full_address) ||
          null,
      }));
      const posts = listed.map((e) =>
        listingImage("events", e.event_code, "post", e.title),
      );
      const images =
        row.channel === "ig_story"
          ? [coverImage(roundup)]
          : row.channel === "x"
            ? [coverImage(roundup), ...posts.slice(0, X_IMAGES - 1)]
            : [coverImage(roundup), ...posts];
      item = {
        ...base,
        ...captionOf(
          row,
          (links) =>
            roundupCaption(
              row.channel,
              {
                kind: roundup.kind,
                dates,
                city: ROUNDUP_CITY.name,
                events: captionEvents,
              },
              links,
            ),
          cityPath(ROUNDUP_CITY.slug),
        ),
        images,
      };
    }

    if (subject && item) subject.items.push(item);
    else if (subject) {
      // The listing is gone: nothing to post, but the row can be skipped.
      subject.items.push({
        ...base,
        caption: "",
        link: "",
        xLength: null,
        images: [],
      });
    }
  }

  const byDay = new Map<string, SocialQueueDay>();
  for (const s of subjects.values()) {
    const { day, ...subject } = s;
    let group = byDay.get(day);
    if (!group) {
      group = { day, isToday: day === today, subjects: [] };
      byDay.set(day, group);
    }
    group.subjects.push(subject);
  }
  const order = ["ig_story", "ig_feed", "x", "wa_channel"];
  for (const group of byDay.values()) {
    for (const s of group.subjects) {
      s.items.sort(
        (a, b) => order.indexOf(a.channel) - order.indexOf(b.channel),
      );
    }
  }

  const [pending, posted, skipped] = counted.map((c) => c.count ?? 0);
  return {
    status: 200,
    data: {
      today,
      days: [...byDay.values()],
      counts: { pending, posted, skipped },
      truncated,
    },
  };
}

const NEXT: Record<SocialPostStatus, SocialPostStatus[]> = {
  pending: ["posted", "skipped"],
  posted: ["pending"],
  skipped: ["pending"],
};

const ACTION: Record<SocialPostStatus, string> = {
  posted: "social.post.posted",
  skipped: "social.post.skipped",
  pending: "social.post.reopened",
};

/**
 * Mark one channel's post as posted or skipped (with an optional note), or
 * put it back in the queue. Only from the state the person saw: if someone
 * else got there first, nothing changes (409).
 */
export async function setSocialPostStatusCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: SocialPostStatusInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<{ id: string; status: SocialPostStatus }>> {
  try {
    assertPermission(ctx, "social.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: before, error: readError } = await supabase
    .from("social_post")
    .select("id, status, channel, subject_key, note")
    .eq("id", input.id)
    .maybeSingle();
  if (readError) {
    logger.error(`setSocialPostStatusCore read failed: ${readError.message}`);
    return { status: 500, message: "Couldn't update the post." };
  }
  if (!before)
    return { status: 404, message: "This post is no longer queued." };
  const from = before.status as SocialPostStatus;
  if (!NEXT[from].includes(input.status)) {
    return {
      status: 409,
      message:
        from === input.status
          ? "It is already marked that way."
          : "Put it back in the queue first.",
    };
  }
  const now = new Date().toISOString();
  const note = input.note?.trim() || null;
  const { data, error } = await supabase
    .from("social_post")
    .update({
      status: input.status,
      posted_at: input.status === "posted" ? now : null,
      posted_by: input.status === "posted" ? ctx.userId : null,
      note: input.status === "pending" ? before.note : note,
      updated_at: now,
      updated_by: ctx.userId,
    })
    .eq("id", input.id)
    .eq("status", from)
    .select("id, status")
    .maybeSingle();
  if (error) {
    logger.error(`setSocialPostStatusCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't update the post." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed this post. Reload the queue.",
    };
  }
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: ACTION[input.status],
    targetType: "social_post",
    targetId: input.id,
    summary: `${before.channel} for ${before.subject_key}: ${from} → ${input.status}`,
    reason: note,
    before: { status: from },
    after: { status: input.status, note },
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return {
    status: 200,
    message:
      input.status === "posted"
        ? "Marked posted."
        : input.status === "skipped"
          ? "Skipped."
          : "Back in the queue.",
    data: { id: data.id, status: data.status as SocialPostStatus },
  };
}

type SettingRow = {
  enabled: boolean;
  daily_cap: number;
  excluded_account_ids: string[];
  queue_watermark: string;
  updated_at: string;
  updated_by: string | null;
};

function mapSettings(row: SettingRow): SocialQueueSettings {
  return {
    enabled: row.enabled,
    dailyCap: row.daily_cap,
    excludedAccountIds: row.excluded_account_ids ?? [],
    queueWatermark: row.queue_watermark,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

const SETTING_COLUMNS =
  "enabled, daily_cap, excluded_account_ids, queue_watermark, updated_at, updated_by";

export async function getSocialQueueSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
): Promise<AdminEnvelope<SocialQueueSettings>> {
  try {
    assertPermission(ctx, "social.view");
  } catch (e) {
    return denied(e);
  }
  const { data, error } = await supabase
    .from("social_queue_setting")
    .select(SETTING_COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) {
    if (error) logger.error(`getSocialQueueSettingsCore: ${error.message}`);
    return { status: 500, message: "Couldn't load the queue settings." };
  }
  return { status: 200, data: mapSettings(data) };
}

const SETTING_COLUMN: Record<
  keyof SocialQueueSettingsInput["patch"],
  keyof SettingRow
> = {
  enabled: "enabled",
  dailyCap: "daily_cap",
  excludedAccountIds: "excluded_account_ids",
};

/** Switch the queue on or off, set the daily cap and the excluded accounts. */
export async function updateSocialQueueSettingsCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: SocialQueueSettingsInput,
  requestMeta?: RequestMeta,
): Promise<AdminEnvelope<SocialQueueSettings>> {
  try {
    assertPermission(ctx, "social.manage");
  } catch (e) {
    return denied(e);
  }
  const { data: beforeRow, error: readError } = await supabase
    .from("social_queue_setting")
    .select(SETTING_COLUMNS)
    .eq("id", 1)
    .maybeSingle();
  if (readError || !beforeRow) {
    return { status: 500, message: "Couldn't load the queue settings." };
  }
  const before = mapSettings(beforeRow);
  const patch = {
    ...input.patch,
    ...(input.patch.excludedAccountIds
      ? {
          excludedAccountIds: [
            ...new Set(
              input.patch.excludedAccountIds.map((id) => id.toLowerCase()),
            ),
          ],
        }
      : {}),
  };
  const update: Record<string, unknown> = {};
  const changed: (keyof typeof SETTING_COLUMN)[] = [];
  for (const key of Object.keys(
    SETTING_COLUMN,
  ) as (keyof typeof SETTING_COLUMN)[]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (JSON.stringify(before[key]) === JSON.stringify(value)) continue;
    update[SETTING_COLUMN[key]] = value;
    changed.push(key);
  }
  if (changed.length === 0) return { status: 400, message: "Nothing changed." };
  update.updated_at = new Date().toISOString();
  update.updated_by = ctx.userId;

  const { data, error } = await supabase
    .from("social_queue_setting")
    .update(update as never)
    .eq("id", 1)
    .eq("updated_at", input.expectedUpdatedAt)
    .select(SETTING_COLUMNS)
    .maybeSingle();
  if (error) {
    logger.error(`updateSocialQueueSettingsCore failed: ${error.message}`);
    return { status: 500, message: "Couldn't save the settings." };
  }
  if (!data) {
    return {
      status: 409,
      message: "Someone else changed these settings. Reload and try again.",
    };
  }
  const after = mapSettings(data);
  await recordAdminAudit(supabase, {
    actorId: ctx.userId,
    actorRoles: ctx.roles,
    action: "social.settings.update",
    targetType: "social_queue_setting",
    targetId: "1",
    summary: `Social queue settings changed: ${changed.join(", ")}`,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, after[k]])),
    requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
  });
  return { status: 200, message: "Settings saved.", data: after };
}
