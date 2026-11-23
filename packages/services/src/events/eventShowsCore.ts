// Runs of shows and copying a listing (docs/architecture/show-runs.md).
// Shared by the web action addEventShows and
// POST /api/mobile/organizer/events/:eventId/shows.
//
// A run is a series of ordinary events, one per show, made from an
// existing listing by event_add_show (one transaction per show: details,
// venue, ticket types with their full stock, group prices, refund policy,
// promo codes still running, promoter terms, switches). Each show then has
// its own seats, door list, payout and cancellation, with nothing new on
// the money path. "Make a copy" is the same with one date and no run.
//
// Tours: new shows (or a copy) may be at another venue in the same country,
// an Abonten place or an address. The venue's country and time zone are
// worked out here from the point, never taken from the client; wall-clock
// times are read on the new venue's clock.

import { createHash } from "node:crypto";
import { generateEventCode } from "@abonten/core/eventCodeGenerator";
import { generateSlug } from "@abonten/core/geerateSlug";
import { logger } from "@abonten/core/logger";
import {
  MAX_SHOWS_PER_REQUEST,
  type ShowRunRule,
  type ShowTime,
  expandShowRun,
  showRunProblemMessage,
} from "@abonten/core/showRuns";
import { parseEventTimestamp } from "@abonten/core/time/timeZone";
import { userFacingError } from "@abonten/core/userFacingError";
import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { coreT, tr } from "../i18n/requestLocale";
import { requireVerifiedIdentity } from "../identity/identityCore";
import {
  isAccountRestricted,
  restrictedAccountMessage,
} from "../security/accountStatus";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import {
  type EventVenueArgs,
  type EventVenueInput,
  resolveEventVenue,
} from "./resolveEventVenue";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const CODE_ATTEMPTS = 3;

/** Where new shows are: an Abonten place, or an address with its point. */
export type ShowVenueInput = EventVenueInput;

export type AddEventShowsInput = {
  eventId: string;
  /** A weekly pattern ("every Friday 4pm until …"), or */
  rule?: ShowRunRule | null;
  /** explicit shows: instants, or wall-clock times in the event's zone. */
  shows?: { startsAt: string; endsAt: string }[] | null;
  /** "Make a copy": one new, separate listing instead of more shows. */
  separate?: boolean;
  /** Another venue (a tour); omitted = the listing's own venue. */
  venue?: ShowVenueInput | null;
  /** One per submission, reused on a retry so nothing is made twice. */
  clientRequestId: string;
};

export type AddedShow = { id: string; eventCode: string; startsAt: string };

export type AddEventShowsResult =
  | {
      status: 200;
      message: string;
      data: { shows: AddedShow[]; skipped: number };
    }
  | { status: 400 | 403 | 404 | 409 | 500; message: string };

/** A stable id for one show of one submission (a retry makes the same). */
function showRequestId(clientRequestId: string, startsAt: string): string {
  const h = createHash("sha1")
    .update(`${clientRequestId}:${startsAt}`)
    .digest("hex");
  // RFC 4122 shape, version 5 bits.
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${(
    (Number.parseInt(h.slice(16, 18), 16) & 0x3f) |
    0x80
  )
    .toString(16)
    .padStart(2, "0")}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export async function addEventShowsCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  input: AddEventShowsInput,
): Promise<AddEventShowsResult> {
  if (await isAccountRestricted(accountId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }

  // The caller's own client: only the organizer (or a member acting for
  // them) reads the listing here.
  const { data: source, error } = await supabase
    .from("event")
    .select(
      "id, title, status, timezone, country_code, starts_at, ends_at, sales_close_before_end_minutes, ticket_type(price)",
    )
    .eq("id", input.eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();

  if (error) {
    logger.error(`addEventShows: listing read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!source) {
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  }
  if (source.status !== "published") {
    return { status: 409, message: tr("onlyAPublishedListingCanBeCopied") };
  }

  // Another venue: its clock reads the times.
  let zone = source.timezone ?? "Africa/Accra";
  let venueArgs: EventVenueArgs = {};
  if (input.venue) {
    const venue = await resolveEventVenue(
      input.venue,
      source.country_code,
      tr("aShowMustBeInTheSameCountry"),
    );
    if (!venue.ok) return { status: venue.status, message: venue.message };
    zone = venue.timeZone || zone;
    venueArgs = venue.args;
  }
  let shows: ShowTime[];
  if (input.rule) {
    const expanded = expandShowRun(input.rule, zone);
    if (!expanded.ok) {
      return {
        status: 400,
        message: showRunProblemMessage(coreT(), expanded.problem),
      };
    }
    shows = expanded.shows;
  } else {
    const parsed = (input.shows ?? []).map((s) => ({
      start: parseEventTimestamp(s.startsAt, zone),
      end: parseEventTimestamp(s.endsAt, zone),
    }));
    if (
      parsed.length === 0 ||
      parsed.some((s) => !s.start || !s.end || s.end <= s.start)
    ) {
      return { status: 400, message: tr("enterAValidStartAndEnd") };
    }
    if (parsed.length > MAX_SHOWS_PER_REQUEST) {
      return {
        status: 400,
        message: showRunProblemMessage(coreT(), "too_many"),
      };
    }
    shows = parsed.map((s) => ({
      startsAt: (s.start as Date).toISOString(),
      endsAt: (s.end as Date).toISOString(),
    }));
  }
  if (input.separate && shows.length !== 1) {
    return { status: 400, message: tr("aCopyHasOneDate") };
  }
  if (shows.some((s) => new Date(s.startsAt).getTime() <= Date.now())) {
    return { status: 400, message: tr("aNewShowMustStartInThe") };
  }

  // Selling tickets needs a traceable organizer, when that is required.
  if ((source.ticket_type ?? []).some((t) => Number(t.price ?? 0) > 0)) {
    const identityGate = await requireVerifiedIdentity(
      getSupabaseServiceClient(),
      accountId,
      "paid_events",
    );
    if (identityGate) {
      return {
        status: identityGate.status === 503 ? 500 : 409,
        message: identityGate.message ?? tr("somethingWentWrong"),
      };
    }
  }

  const service = getSupabaseServiceClient();
  const added: AddedShow[] = [];
  let skipped = 0;

  for (const show of shows) {
    const requestId = showRequestId(input.clientRequestId, show.startsAt);
    let made: string | null = null;
    let lastError: { code?: string; message: string } | null = null;
    for (let attempt = 1; attempt <= CODE_ATTEMPTS && !made; attempt++) {
      const eventCode = generateEventCode(source.title);
      const slug = `${generateSlug(source.title)}-${generateSlug(eventCode)}`;
      const { data, error: rpcError } = await service.rpc("event_add_show", {
        p_source: source.id,
        p_starts_at: show.startsAt,
        p_ends_at: show.endsAt,
        p_event_code: eventCode,
        p_slug: slug,
        p_client_request_id: requestId,
        p_in_series: !input.separate,
        ...venueArgs,
      });
      if (!rpcError && data) {
        made = data as string;
        break;
      }
      lastError = rpcError;
      const codeTaken =
        rpcError?.code === UNIQUE_VIOLATION &&
        (rpcError.message.includes("event_event_code_key") ||
          rpcError.message.includes("event_slug_key"));
      if (!codeTaken) break;
    }

    if (!made) {
      // The run already has a show at that time: say so in the total.
      if (
        lastError?.code === UNIQUE_VIOLATION &&
        lastError.message.includes("already has a show")
      ) {
        skipped += 1;
        continue;
      }
      // A refusal the database explains (a listing Abonten has hidden, a
      // date gone by) is the person's to read when nothing was made yet.
      if (lastError?.code === CHECK_VIOLATION && added.length === 0) {
        return {
          status: 409,
          message: userFacingError(
            `addEventShows: show at ${show.startsAt} refused for ${source.id}`,
            lastError,
          ),
        };
      }
      logger.error(
        `addEventShows: show at ${show.startsAt} failed for ${source.id}: ${lastError?.message}`,
      );
      // What was made stays (a retry of the same submission completes the
      // rest without making anything twice).
      return {
        status: 500,
        message:
          added.length > 0
            ? tr("someShowsWereAddedTryAgain", { count: added.length })
            : tr("somethingWentWrong"),
      };
    }

    const { data: row } = await service
      .from("event")
      .select("event_code")
      .eq("id", made)
      .single();
    added.push({
      id: made,
      eventCode: row?.event_code ?? "",
      startsAt: show.startsAt,
    });
  }

  // When online sales close goes with the listing, like its refund policy
  // (event_add_show copies everything else; kept out of it so its
  // definition is not made again for one column). A retry writes it again.
  if (source.sales_close_before_end_minutes != null && added.length > 0) {
    const { error: salesCloseError } = await service
      .from("event")
      .update({
        sales_close_before_end_minutes: source.sales_close_before_end_minutes,
      })
      .in(
        "id",
        added.map((show) => show.id),
      );
    if (salesCloseError) {
      logger.error(
        `addEventShows: copying when sales close failed for ${source.id}: ${salesCloseError.message}`,
      );
      return { status: 500, message: tr("salesCloseNotCopied") };
    }
  }

  return {
    status: 200,
    message: input.separate
      ? tr("copyMade")
      : tr("showsAdded", { count: added.length }),
    data: { shows: added, skipped },
  };
}

// --- Bringing another run into this one -------------------------------------
//
// An organizer who copied a listing for a second week and then added shows
// to the copy has two runs of the same play, listed twice. They can bring
// the other listing (with every show of its run) into this run:
// public.event_join_runs holds the rules (both theirs and published, same
// country and currency, no pass in either run, no two shows at the same
// time at one venue). Each show stays its own event.

/** One of the account's other runs (or single listings) that could join. */
export type JoinableRun = {
  /** The earliest upcoming show: what the join is asked with. */
  eventId: string;
  title: string;
  showCount: number;
  firstStartsAt: string | null;
  lastStartsAt: string | null;
  timezone: string;
};

export type ListJoinableRunsResult =
  | { status: 200; data: JoinableRun[] }
  | { status: 404 | 500; message: string };

type RunCandidate = {
  id: string;
  title: string;
  series_id: string | null;
  starts_at: string | null;
  timezone: string | null;
};

export async function listJoinableRunsCore(
  supabase: SupabaseClient<Database>,
  accountId: string,
  eventId: string,
): Promise<ListJoinableRunsResult> {
  const { data: target, error } = await supabase
    .from("event")
    .select("id, series_id, country_code, currency")
    .eq("id", eventId)
    .eq("organizer_id", accountId)
    .maybeSingle();
  if (error) {
    logger.error(`listJoinableRuns: listing read failed (${error.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  if (!target) {
    return { status: 404, message: tr("eventNotFoundOrUnauthorized") };
  }

  // The account's other published listings still to come, in this market.
  let query = supabase
    .from("event")
    .select("id, title, series_id, starts_at, timezone")
    .eq("organizer_id", accountId)
    .eq("status", "published")
    .is("archived_at", null)
    .gt("starts_at", new Date().toISOString())
    .neq("id", target.id)
    .order("starts_at", { ascending: true })
    .limit(500);
  if (target.country_code)
    query = query.eq("country_code", target.country_code);
  if (target.currency) query = query.eq("currency", target.currency);
  const { data: rows, error: listError } = await query;
  if (listError) {
    logger.error(`listJoinableRuns: list failed (${listError.message})`);
    return { status: 500, message: tr("somethingWentWrong") };
  }

  const runs = new Map<string, JoinableRun>();
  for (const row of (rows ?? []) as RunCandidate[]) {
    if (target.series_id && row.series_id === target.series_id) continue;
    const key = row.series_id ?? row.id;
    const run = runs.get(key);
    if (!run) {
      runs.set(key, {
        eventId: row.id,
        title: row.title,
        showCount: 1,
        firstStartsAt: row.starts_at,
        lastStartsAt: row.starts_at,
        timezone: row.timezone ?? "Africa/Accra",
      });
    } else {
      run.showCount += 1;
      run.lastStartsAt = row.starts_at;
    }
  }
  return { status: 200, data: [...runs.values()].slice(0, 50) };
}

export type JoinEventRunsResult =
  | { status: 200; message: string; data: { shows: number } }
  | { status: 403 | 404 | 409 | 500; message: string };

const JOIN_ERRORS: Record<string, { status: 404 | 409; key: string }> = {
  not_yours: { status: 404, key: "eventNotFoundOrUnauthorized" },
  not_published: { status: 409, key: "joinRunsNotPublished" },
  same_run: { status: 409, key: "joinRunsSameRun" },
  other_country: { status: 409, key: "aShowMustBeInTheSameCountry" },
  has_passes: { status: 409, key: "joinRunsHasPasses" },
  same_time: { status: 409, key: "joinRunsSameTime" },
};

export async function joinEventRunsCore(
  accountId: string,
  input: { eventId: string; otherEventId: string },
): Promise<JoinEventRunsResult> {
  if (await isAccountRestricted(accountId)) {
    return { status: 403, message: restrictedAccountMessage() };
  }
  const { data, error } = await getSupabaseServiceClient().rpc(
    "event_join_runs",
    {
      p_account: accountId,
      p_event_id: input.eventId,
      p_other_event_id: input.otherEventId,
    },
  );
  if (error) {
    const code = /join_runs:([a-z_]+)/.exec(error.message ?? "")?.[1];
    const known = code ? JOIN_ERRORS[code] : undefined;
    if (known) return { status: known.status, message: tr(known.key) };
    logger.error(`joinEventRuns failed for ${input.eventId}: ${error.message}`);
    return { status: 500, message: tr("somethingWentWrong") };
  }
  const shows = Number((data as { shows?: number } | null)?.shows ?? 0);
  return {
    status: 200,
    message: tr("joinRunsDone", { count: shows }),
    data: { shows },
  };
}
