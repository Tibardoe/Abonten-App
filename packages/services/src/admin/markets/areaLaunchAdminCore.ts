// Admin › Markets › a market › Launched cities: which cities Abonten is open
// in, what a point outside them is, and the people waiting for each. The
// rule itself is @abonten/core/market/coverage; the waiting list is
// @abonten/services/markets/areaWaitlistCore.
//
//   markets.view    the overview (people waiting, upcoming events, places)
//   markets.manage  launch a city / mark it coming soon, notify the people
//                   waiting, set the market's coverage mode and its browse
//                   fallback (which launched cities Explore offers instead)
//
// Nothing here blocks a listing, a search or a payment: "not launched" only
// changes what Explore says. Every write is audited and drops the market
// cache so the apps see it within a minute.

import {
  BROWSE_LIMIT_MAX,
  BROWSE_LIMIT_MIN,
  BROWSE_STRATEGIES,
  type BrowseStrategy,
  type CoverageMode,
  type LaunchStatus,
} from "@abonten/core/market/coverage";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { getMarket, invalidateMarketCache } from "../../markets/marketConfig";
import {
  type AdminEnvelope,
  adminError,
  assertPermission,
  recordAdminAudit,
} from "../adminContext";

type Meta = Record<string, unknown> | undefined;

export type RegionLaunchStats = {
  regionId: string;
  /** Distinct people waiting inside the city's radius. */
  waiting: number;
  upcomingEvents: number;
  places: number;
};

export type WaitingOutside = {
  label: string;
  waiting: number;
  lat: number;
  lng: number;
};

export type AreaLaunchOverview = {
  regions: RegionLaunchStats[];
  /** People waiting outside every listed city, most-asked first. */
  outside: WaitingOutside[];
};

export async function getAreaLaunchOverviewAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  countryCode: string,
): Promise<AdminEnvelope<AreaLaunchOverview>> {
  try {
    assertPermission(ctx, "markets.view");
    const code = countryCode.toUpperCase();
    const [regions, outside] = await Promise.all([
      supabase.rpc("area_launch_overview", { p_country_code: code }),
      supabase.rpc("area_waitlist_outside", {
        p_country_code: code,
        p_limit: 20,
      }),
    ]);
    if (regions.error) return { status: 500, message: regions.error.message };
    if (outside.error) return { status: 500, message: outside.error.message };
    return {
      status: 200,
      data: {
        regions: (regions.data ?? []).map((r) => ({
          regionId: r.region_id,
          waiting: Number(r.waiting),
          upcomingEvents: Number(r.upcoming_events),
          places: Number(r.places),
        })),
        outside: (outside.data ?? []).map((o) => ({
          label: o.label,
          waiting: Number(o.waiting),
          lat: o.lat,
          lng: o.lng,
        })),
      },
    };
  } catch (e) {
    return adminError(e);
  }
}

async function notifyWaiting(
  supabase: ServiceRoleClient,
  regionId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("area_waitlist_notify", {
    p_region_id: regionId,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

function peopleTold(n: number): string {
  if (n === 0) return "Nobody was waiting.";
  return n === 1
    ? "1 person waiting was told."
    : `${n} people waiting were told.`;
}

export async function setRegionLaunchAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    countryCode: string;
    regionId: string;
    launchStatus: LaunchStatus;
    /** Only with "launched": tell everyone waiting in the city now. */
    notifyWaiting?: boolean;
  },
  requestMeta?: Meta,
): Promise<AdminEnvelope<{ notified: number }>> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    if (
      input.launchStatus !== "launched" &&
      input.launchStatus !== "coming_soon"
    )
      return { status: 400, message: "Unknown launch status." };
    invalidateMarketCache();
    const market = await getMarket(code);
    const region = market?.regions.find((r) => r.id === input.regionId);
    if (!market || !region)
      return { status: 404, message: "City not found in this market." };
    if (input.launchStatus === "launched" && region.status !== "active")
      return {
        status: 400,
        message: "Make the city active before launching it.",
      };

    const { error } = await supabase
      .from("market_region")
      .update({
        launch_status: input.launchStatus,
        ...(input.launchStatus === "launched"
          ? { launched_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", region.id)
      .eq("country_code", code);
    if (error) return { status: 500, message: error.message };
    invalidateMarketCache();

    let notified = 0;
    let notifyFailed: string | null = null;
    if (input.launchStatus === "launched" && input.notifyWaiting) {
      try {
        notified = await notifyWaiting(supabase, region.id);
      } catch (e) {
        notifyFailed = e instanceof Error ? e.message : String(e);
      }
    }

    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action:
        input.launchStatus === "launched"
          ? "markets.region.launch"
          : "markets.region.coming_soon",
      targetType: "market",
      targetId: code,
      summary:
        input.launchStatus === "launched"
          ? `Launched ${region.name} (${code}); ${
              input.notifyWaiting ? `notified ${notified}` : "no notices sent"
            }`
          : `Marked ${region.name} (${code}) coming soon`,
      after: {
        regionId: region.id,
        slug: region.slug,
        launchStatus: input.launchStatus,
        notified,
        ...(notifyFailed ? { notifyFailed } : {}),
      },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });

    if (notifyFailed)
      return {
        status: 500,
        message: `${region.name} is launched, but the notices failed: ${notifyFailed}. Use "Notify people waiting" to try again.`,
      };
    return {
      status: 200,
      message:
        input.launchStatus === "launched"
          ? `${region.name} is launched. ${
              input.notifyWaiting
                ? peopleTold(notified)
                : "No notices were sent."
            }`
          : `${region.name} is marked coming soon.`,
      data: { notified },
    };
  } catch (e) {
    return adminError(e);
  }
}

/** Tells the people waiting in an already-launched city (e.g. a retry). */
export async function notifyRegionWaitlistAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { countryCode: string; regionId: string },
  requestMeta?: Meta,
): Promise<AdminEnvelope<{ notified: number }>> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    invalidateMarketCache();
    const market = await getMarket(code);
    const region = market?.regions.find((r) => r.id === input.regionId);
    if (!market || !region)
      return { status: 404, message: "City not found in this market." };
    if (region.launchStatus !== "launched" || region.status !== "active")
      return {
        status: 400,
        message: `Launch ${region.name} before telling the people waiting.`,
      };
    const notified = await notifyWaiting(supabase, region.id);
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "markets.region.notify_waitlist",
      targetType: "market",
      targetId: code,
      summary: `Notified ${notified} waiting for ${region.name} (${code})`,
      after: { regionId: region.id, slug: region.slug, notified },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return { status: 200, message: peopleTold(notified), data: { notified } };
  } catch (e) {
    return adminError(e);
  }
}

export async function setCoverageModeAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: { countryCode: string; mode: CoverageMode },
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    if (input.mode !== "everywhere" && input.mode !== "launched_areas")
      return { status: 400, message: "Unknown coverage mode." };
    invalidateMarketCache();
    const market = await getMarket(code);
    if (!market) return { status: 404, message: "Market not found" };
    const { error } = await supabase
      .from("market")
      .update({ coverage_mode: input.mode, updated_by: ctx.userId })
      .eq("country_code", code);
    if (error) return { status: 500, message: error.message };
    invalidateMarketCache();
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "markets.coverage_mode",
      targetType: "market",
      targetId: code,
      summary: `Outside listed cities in ${market.name}: ${
        input.mode === "launched_areas" ? "not launched yet" : "open"
      }`,
      after: { coverageMode: input.mode, previous: market.coverageMode },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return {
      status: 200,
      message:
        input.mode === "launched_areas"
          ? "Places outside the listed cities now show as not launched yet."
          : "Places outside the listed cities now show as open.",
    };
  } catch (e) {
    return adminError(e);
  }
}

/**
 * Which launched cities Explore offers someone in an area Abonten hasn't
 * launched in (@abonten/core/market/coverage `browseSuggestions`). A fixed
 * city must be an active, launched city of this market when it is chosen;
 * if it stops being one later, Explore suggests the nearest instead.
 */
export async function setBrowseFallbackAdminCore(
  supabase: ServiceRoleClient,
  ctx: AdminContext,
  input: {
    countryCode: string;
    strategy: BrowseStrategy;
    regionId?: string | null;
    limit?: number;
  },
  requestMeta?: Meta,
): Promise<AdminEnvelope> {
  try {
    assertPermission(ctx, "markets.manage");
    const code = input.countryCode.toUpperCase();
    if (!BROWSE_STRATEGIES.includes(input.strategy))
      return { status: 400, message: "Unknown browse fallback." };
    const limit = input.limit ?? 3;
    if (
      !Number.isInteger(limit) ||
      limit < BROWSE_LIMIT_MIN ||
      limit > BROWSE_LIMIT_MAX
    )
      return {
        status: 400,
        message: `Show between ${BROWSE_LIMIT_MIN} and ${BROWSE_LIMIT_MAX} cities.`,
      };
    invalidateMarketCache();
    const market = await getMarket(code);
    if (!market) return { status: 404, message: "Market not found" };

    let regionId: string | null = null;
    if (input.strategy === "fixed") {
      const city = market.regions.find((r) => r.id === input.regionId);
      if (!city) return { status: 400, message: "Choose a city." };
      if (city.status !== "active" || city.launchStatus !== "launched")
        return {
          status: 400,
          message: `${city.name} isn't launched. Choose a launched city, or launch ${city.name} first.`,
        };
      regionId = city.id;
    }

    const { error } = await supabase
      .from("market")
      .update({
        browse_fallback: input.strategy,
        browse_fallback_region_id: regionId,
        browse_fallback_limit: limit,
        updated_by: ctx.userId,
      })
      .eq("country_code", code);
    if (error) return { status: 500, message: error.message };
    invalidateMarketCache();

    const city = regionId
      ? market.regions.find((r) => r.id === regionId)?.name
      : null;
    const summary =
      input.strategy === "choose"
        ? `let people choose from up to ${limit} cities`
        : input.strategy === "fixed"
          ? `suggest ${city}`
          : input.strategy === "most_active"
            ? "suggest the most active launched city"
            : "suggest the nearest launched city";
    await recordAdminAudit(supabase, {
      actorId: ctx.userId,
      actorRoles: ctx.roles,
      action: "markets.browse_fallback",
      targetType: "market",
      targetId: code,
      summary: `Browse fallback in ${market.name}: ${summary}`,
      after: {
        strategy: input.strategy,
        regionId,
        limit,
        previous: market.browseFallback,
      },
      requestMeta: { ...(requestMeta ?? {}), roles: ctx.roles },
    });
    return {
      status: 200,
      message: `Saved. Explore will ${summary}.`,
    };
  } catch (e) {
    return adminError(e);
  }
}
