import { resolveAdminRange } from "@abonten/core/admin/adminDateRange";
import type { AdminContext } from "@abonten/types/adminTypes";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformAnalyticsCore } from "../admin/analytics/analyticsAdminCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Analytics has to be honest in two specific ways:
//
//   * a period with no activity is a zero on the chart, not a missing point.
//     The old JavaScript bucketing dropped empty days, so a quiet week looked
//     like a gap in the data rather than a quiet week.
//   * a breakdown small enough to point at one person is withheld, and the
//     complement is withheld with it so it cannot be recovered by subtraction.

const service = getServiceClient() as unknown as ServiceRoleClient;

const ctxFor = (userId: string): AdminContext => ({
  userId,
  email: null,
  roles: ["analyst"],
  permissions: ["analytics.view"],
  reauthenticatedAt: Date.now(),
});

let analyst: TestUser;
let ctx: AdminContext;

beforeAll(async () => {
  analyst = await createTestUser(service);
  ctx = ctxFor(analyst.id);
});

afterAll(async () => {
  await deleteTestUser(service, analyst.id);
});

describe("platform analytics", () => {
  it("returns one point per day, including the days nothing happened", async () => {
    const range = resolveAdminRange("30d");
    const res = await getPlatformAnalyticsCore(service, ctx, range);
    expect(res.status).toBe(200);
    const a = res.data;
    if (!a) throw new Error("no data");

    // 30 calendar days, today included.
    expect(a.series).toHaveLength(30);
    expect(a.previousSeries).toHaveLength(30);
    expect(a.bucket).toBe("day");

    // Every point is a real number, never undefined, and the days are in
    // order with no gaps.
    for (const point of a.series) {
      expect(Number.isFinite(point.newUsers)).toBe(true);
      expect(Number.isFinite(point.grossTicketSales)).toBe(true);
    }
    const dates = a.series.map((p) => p.bucketStart);
    expect([...dates].sort()).toEqual(dates);

    // The series must add up to the headline figures for the same window.
    const seriesUsers = a.series.reduce((sum, p) => sum + p.newUsers, 0);
    expect(seriesUsers).toBe(a.current.newUsers);
    const seriesGross = a.series.reduce(
      (sum, p) => sum + p.grossTicketSales,
      0,
    );
    expect(Math.round(seriesGross * 100)).toBe(
      Math.round(a.current.grossTicketSales * 100),
    );
  });

  it("buckets by hour for today and by week for a year", async () => {
    const today = await getPlatformAnalyticsCore(
      service,
      ctx,
      resolveAdminRange("today"),
    );
    expect(today.data?.bucket).toBe("hour");

    const year = await getPlatformAnalyticsCore(
      service,
      ctx,
      resolveAdminRange("ytd"),
    );
    expect(year.data?.bucket).toBe("week");
  });

  it("withholds a breakdown that would point at individuals", async () => {
    const res = await getPlatformAnalyticsCore(
      service,
      ctx,
      resolveAdminRange("30d"),
    );
    const demo = res.data?.demographics;
    if (!demo) throw new Error("no data");

    for (const bucket of demo.signInMethod.buckets) {
      if (bucket.suppressed) {
        // A withheld bucket carries no number at all — not even a zero,
        // which would read as "nobody" rather than "not shown".
        expect(bucket.count).toBeNull();
      } else {
        expect(bucket.count).not.toBeNull();
      }
    }
    // Never exactly one: the complement would give it away.
    expect(demo.signInMethod.suppressedCount).not.toBe(1);
  });

  it("refuses a percentage the sample cannot support", async () => {
    const res = await getPlatformAnalyticsCore(
      service,
      ctx,
      resolveAdminRange("30d"),
    );
    const demo = res.data?.demographics;
    if (!demo) throw new Error("no data");

    if (demo.buyersPrevious < 5) {
      expect(demo.returningBuyerRate).toBeNull();
    } else {
      expect(demo.returningBuyerRate).toBeGreaterThanOrEqual(0);
      expect(demo.returningBuyerRate).toBeLessThanOrEqual(1);
    }
    if (demo.activeUsers >= 5) {
      expect(demo.buyerConversion).not.toBeNull();
    }
  });

  it("keeps the analytics RPCs away from signed-in users", async () => {
    const range = resolveAdminRange("30d");
    const analytics = await analyst.client.rpc("admin_platform_analytics", {
      p_from: range.from,
      p_to: range.to,
      p_bucket: "day",
      p_prev_from: range.prevFrom ?? range.from,
      p_prev_to: range.prevTo ?? range.from,
    });
    expect(analytics.error).not.toBeNull();

    // This one reads auth.users, so it matters most of all.
    const demographics = await analyst.client.rpc("admin_user_demographics", {
      p_from: range.from,
      p_to: range.to,
      p_prev_from: range.prevFrom ?? range.from,
      p_prev_to: range.prevTo ?? range.from,
    });
    expect(demographics.error).not.toBeNull();
  });

  it("refuses an admin without analytics.view", async () => {
    const res = await getPlatformAnalyticsCore(
      service,
      { ...ctxFor(analyst.id), permissions: ["users.view"] },
      resolveAdminRange("30d"),
    );
    expect(res.status).toBe(403);
  });
});
