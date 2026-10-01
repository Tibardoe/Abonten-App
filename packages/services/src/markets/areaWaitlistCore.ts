// Launched areas and the "tell me when it launches" waiting list. The rule
// for whether Abonten is open at a point is @abonten/core/market/coverage;
// this module applies it on the server (for the web page and before anyone
// is recorded on the list) and keeps the list.
//
// `area_waitlist` has no client access: every read and write is here, with
// the service role, for the signed-in person only (web actions under
// apps/web/src/actions/markets/, mobile /api/mobile/areas/waitlist). A row
// holds the account, the city or ~1 km cell, and the area's name; it is
// deleted when the launch notice goes out (area_waitlist_notify), when the
// person leaves the list, or when the account is deleted.

import { distanceMetres } from "@abonten/core/fieldOps/territory";
import { logger } from "@abonten/core/logger";
import {
  type AreaCoverage,
  WAITLIST_SAME_AREA_KM,
  areaCoverage,
  coarsePoint,
  containingRegion,
  waitlistAreaKey,
} from "@abonten/core/market/coverage";
import type { MarketConfig } from "@abonten/core/market/types";
import type { AreaWaitlistStatus } from "@abonten/types/marketType";
import { resolveLocation } from "../geo/locationResolution";
import { tr } from "../i18n/requestLocale";
import { checkRateLimit } from "../security/rateLimit";
import { getSupabaseServiceClient } from "../supabase/serviceClient";
import { getDefaultMarket, listOpenMarkets } from "./marketConfig";

type Envelope<T> = { status: number; message?: string; data?: T };

type Point = { lat: number; lng: number };

/** Most areas one person can wait for at once. */
const MAX_WAITING_AREAS = 20;
const JOINS_PER_MINUTE = 10;

/** Labels the app shows for a point it couldn't name; never stored. */
const GENERIC_LABELS = new Set([
  "your location",
  "selected location",
  "your area",
  "current location",
]);

function validPoint(input: {
  lat?: unknown;
  lng?: unknown;
}): Point | null {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function cleanLabel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text || GENERIC_LABELS.has(text.toLowerCase())) return null;
  // "Osu, Accra, Ghana" → "Osu, Accra": the country adds nothing here.
  const parts = text.split(",").map((p) => p.trim());
  const short = parts.length > 2 ? parts.slice(0, 2).join(", ") : text;
  return short.slice(0, 80);
}

/**
 * Coverage at a point, as the server sees it. Outside every listed city the
 * market is the point's own when it is open, else the default market —
 * the same fallback the locale context uses. `marketCountry` (the caller's
 * already-resolved market) skips the country lookup.
 */
export async function getAreaCoverageCore(input: {
  lat: number;
  lng: number;
  marketCountry?: string | null;
}): Promise<AreaCoverage & { pointCountry: string | null }> {
  const point = { lat: input.lat, lng: input.lng };
  const markets = await listOpenMarkets();
  const inside = containingRegion(markets, point);
  let marketCountry = input.marketCountry ?? null;
  let pointCountry: string | null = inside?.countryCode ?? null;
  if (!inside && !marketCountry) {
    try {
      pointCountry = (await resolveLocation(point)).countryCode || null;
    } catch (error) {
      logger.warn(
        `areaCoverage: country lookup failed (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    marketCountry =
      pointCountry && markets.some((m) => m.countryCode === pointCountry)
        ? pointCountry
        : (await getDefaultMarket()).countryCode;
  }
  return {
    ...areaCoverage({ markets, marketCountry, point }),
    pointCountry,
  };
}

type WaitlistRow = {
  id: string;
  area_key: string;
  region_id: string | null;
  lat: number;
  lng: number;
  label: string;
};

async function myRows(userId: string): Promise<WaitlistRow[]> {
  const { data, error } = await getSupabaseServiceClient()
    .from("area_waitlist")
    .select("id, area_key, region_id, lat, lng, label")
    .eq("user_id", userId)
    .limit(MAX_WAITING_AREAS + 5);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Which of the person's rows stand for the area at `point` — the same rule
 * area_waitlist_notify uses to decide who a launch tells. Inside a listed
 * city: the rows for that city, and rows taken outside every city at a spot
 * the city now covers. Outside every city: rows taken outside every city
 * within WAITLIST_SAME_AREA_KM. Used for "am I waiting here?", for leaving,
 * and to refuse a second row for the same area (so joining again from
 * across town, or from the other app, adds nothing).
 */
export function rowsForPoint<
  T extends { region_id: string | null; lat: number; lng: number },
>(rows: readonly T[], point: Point, markets: readonly MarketConfig[]): T[] {
  const inside = containingRegion(markets, point)?.region ?? null;
  return rows.filter((row) => {
    if (row.region_id !== null)
      return inside !== null && row.region_id === inside.id;
    if (inside && distanceMetres(row, inside) <= inside.radiusKm * 1000)
      return true;
    return distanceMetres(row, point) <= WAITLIST_SAME_AREA_KM * 1000;
  });
}

/** The person's rows that stand for the area at `point`. */
async function rowsForArea(
  userId: string,
  point: Point,
): Promise<WaitlistRow[]> {
  const [rows, markets] = await Promise.all([
    myRows(userId),
    listOpenMarkets(),
  ]);
  return rowsForPoint(rows, point, markets);
}

export async function getAreaWaitlistStatusCore(
  userId: string,
  input: { lat?: unknown; lng?: unknown },
): Promise<Envelope<AreaWaitlistStatus>> {
  const point = validPoint(input);
  if (!point) return { status: 400, message: tr("chooseAnAreaFirst") };
  try {
    const rows = await rowsForArea(userId, point);
    return {
      status: 200,
      data: { waiting: rows.length > 0, areaName: rows[0]?.label ?? null },
    };
  } catch (error) {
    logger.error("getAreaWaitlistStatusCore failed", error);
    return { status: 500, message: tr("somethingWentWrong") };
  }
}

export async function joinAreaWaitlistCore(
  userId: string,
  input: {
    lat?: unknown;
    lng?: unknown;
    label?: unknown;
    source: "web" | "app";
  },
): Promise<Envelope<AreaWaitlistStatus>> {
  const point = validPoint(input);
  if (!point) return { status: 400, message: tr("chooseAnAreaFirst") };
  try {
    if (
      !(await checkRateLimit(`area-waitlist:${userId}`, JOINS_PER_MINUTE, 60))
    )
      return {
        status: 429,
        message: tr("tooManyRequestsTryAgainIn"),
      };

    const coverage = await getAreaCoverageCore(point);
    if (coverage.kind === "open")
      return {
        status: 409,
        message: tr("abontenIsAlreadyOpenHereHave"),
      };

    const [existing, markets] = await Promise.all([
      myRows(userId),
      listOpenMarkets(),
    ]);
    const key = waitlistAreaKey(coverage.region, point);
    // Already waiting for this area (same city, or a spot near this one):
    // answer as if joined, without a second row.
    const already =
      existing.find((row) => row.area_key === key) ??
      rowsForPoint(existing, point, markets)[0];
    if (already)
      return { status: 200, data: { waiting: true, areaName: already.label } };
    const coarse = coarsePoint(point);
    const areaName =
      coverage.region?.name ?? cleanLabel(input.label) ?? tr("unnamedArea");
    if (existing.length >= MAX_WAITING_AREAS)
      return {
        status: 400,
        message: tr("youReAlreadyWaitingForAreas", {
          MAX_WAITING_AREAS: MAX_WAITING_AREAS,
        }),
      };

    const { error } = await getSupabaseServiceClient()
      .from("area_waitlist")
      .upsert(
        {
          user_id: userId,
          country_code: (
            coverage.pointCountry ??
            coverage.countryCode ??
            (await getDefaultMarket()).countryCode
          ).toUpperCase(),
          region_id: coverage.region?.id ?? null,
          area_key: key,
          label: areaName,
          lat: coarse.lat,
          lng: coarse.lng,
          source: input.source,
        },
        { onConflict: "user_id,area_key", ignoreDuplicates: true },
      );
    if (error) {
      logger.error(`joinAreaWaitlistCore: insert failed (${error.message})`);
      return { status: 500, message: tr("somethingWentWrong") };
    }
    return { status: 200, data: { waiting: true, areaName } };
  } catch (error) {
    logger.error("joinAreaWaitlistCore failed", error);
    return { status: 500, message: tr("somethingWentWrong") };
  }
}

export async function leaveAreaWaitlistCore(
  userId: string,
  input: { lat?: unknown; lng?: unknown },
): Promise<Envelope<AreaWaitlistStatus>> {
  const point = validPoint(input);
  if (!point) return { status: 400, message: tr("chooseAnAreaFirst") };
  try {
    const rows = await rowsForArea(userId, point);
    if (rows.length > 0) {
      const { error } = await getSupabaseServiceClient()
        .from("area_waitlist")
        .delete()
        .eq("user_id", userId)
        .in(
          "id",
          rows.map((r) => r.id),
        );
      if (error) {
        logger.error(`leaveAreaWaitlistCore: delete failed (${error.message})`);
        return { status: 500, message: tr("somethingWentWrong") };
      }
    }
    return { status: 200, data: { waiting: false, areaName: null } };
  } catch (error) {
    logger.error("leaveAreaWaitlistCore failed", error);
    return { status: 500, message: tr("somethingWentWrong") };
  }
}
