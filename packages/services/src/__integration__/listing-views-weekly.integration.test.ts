import type { Database } from "@abonten/types/database.types";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// The Monday note to listers (docs/architecture/social-distribution.md):
// one notice per account whose events or places were viewed in the past
// seven days, with the most viewed listing and how many views came from
// Abonten's own posts (?src=); a person's notice is pushed, a team's reaches
// its Owners through the fan-out; a second run in the same week sends
// nothing; an account with no views gets nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTeamCore } from "../teams/teamCore";
import { resetTeamSettingsCache } from "../teams/teamProgram";
import {
  type TestUser,
  createTestEventWithTicketType,
  createTestUser,
  deleteTestEvent,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// A Monday far from any real run, so the once-a-week guard is this test's.
const NOW = "2031-03-10T09:00:00.000Z";
const WEEK = "2031-03-10";
const DAY = 86_400_000;

type NoticeData = {
  kind?: string;
  notice?: {
    id: string;
    params: { views: number; social: number; top: string };
  };
};

describe("the weekly listing-views note", () => {
  let service: SupabaseClient<Database>;
  let svc: ServiceRoleClient;
  const users: TestUser[] = [];
  const eventIds: string[] = [];
  let organizer: TestUser;
  let quiet: TestUser;
  let owner: TestUser;
  let teamId: string;
  let busy: string;
  let calm: string;
  let teamEvent: string;

  async function views(
    eventId: string,
    sources: (string | null)[],
  ): Promise<void> {
    const at = new Date(new Date(NOW).getTime() - DAY).toISOString();
    const { error } = await service.from("event_analytics_event").insert(
      sources.map((source) => ({
        event_id: eventId,
        event_type: "view",
        platform: "web",
        source,
        created_at: at,
      })) as never,
    );
    if (error) throw new Error(error.message);
  }

  async function noticesFor(userId: string) {
    const { data } = await service
      .from("notification")
      .select("id, type, link, data")
      .eq("user_id", userId)
      .eq("type", "listing_views_weekly");
    return (data ?? []) as {
      id: string;
      type: string;
      link: string | null;
      data: NoticeData;
    }[];
  }

  beforeAll(async () => {
    service = getServiceClient();
    svc = service as unknown as ServiceRoleClient;
    await service
      .from("listing_views_weekly_run")
      .delete()
      .eq("week_start", WEEK);
    await service
      .from("team_program_setting")
      .update({ enabled: true, audience: "all" })
      .eq("id", 1);
    resetTeamSettingsCache();
    organizer = await createTestUser(service);
    quiet = await createTestUser(service);
    owner = await createTestUser(service);
    users.push(organizer, quiet, owner);
    const made = await createTeamCore(svc, owner.id, {
      adult: true,
      name: "Views Crew",
      username: `lvw_${crypto.randomUUID().slice(0, 8)}`,
    });
    if (made.status !== 200) throw new Error(made.message);
    teamId = made.data.id;

    for (const [who, list] of [
      [organizer.id, 2],
      [quiet.id, 1],
      [teamId, 1],
    ] as const) {
      for (let i = 0; i < list; i++) {
        const { eventId } = await createTestEventWithTicketType(service, who, {
          quantity: 10,
          price: 0,
        });
        eventIds.push(eventId);
      }
    }
    [busy, calm] = eventIds;
    teamEvent = eventIds[3];
    await service.from("event").update({ title: "Busy Night" }).eq("id", busy);
    await views(busy, ["ig", "ig", "x", null, null]);
    await views(calm, ["wa", null]);
    await views(teamEvent, [null, "ig"]);
  });

  afterAll(async () => {
    await service
      .from("team_program_setting")
      .update({ enabled: false })
      .eq("id", 1);
    resetTeamSettingsCache();
    await service
      .from("listing_views_weekly_run")
      .delete()
      .eq("week_start", WEEK);
    const accounts = [teamId, ...users.map((u) => u.id)];
    await service.from("notification").delete().in("user_id", accounts);
    for (const id of eventIds) {
      await deleteTestEvent(service, id).catch(() => undefined);
    }
    await service.auth.admin.deleteUser(teamId).catch(() => undefined);
    await Promise.all(users.map((u) => deleteTestUser(service, u.id)));
  });

  it("tells each lister their week, once", async () => {
    const { data: sent, error } = await service.rpc(
      "listing_views_weekly_notices",
      { p_now: NOW },
    );
    expect(error).toBeNull();
    expect(Number(sent)).toBeGreaterThanOrEqual(2);

    const mine = await noticesFor(organizer.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].link).toBe(`/manage/events/${busy}`);
    expect(mine[0].data.kind).toBe("listing_views");
    expect(mine[0].data.notice?.id).toBe("listing_views_weekly");
    expect(mine[0].data.notice?.params).toEqual({
      views: 7,
      social: 4,
      top: "Busy Night",
    });
    const { data: pushes } = await service
      .from("notification_delivery")
      .select("channel, source")
      .eq("notification_id", mine[0].id);
    expect(pushes).toEqual([{ channel: "push", source: "app" }]);

    // No views, no notice.
    expect(await noticesFor(quiet.id)).toHaveLength(0);

    // A team's note reaches its Owner as a pushed copy.
    expect(await noticesFor(teamId)).toHaveLength(1);
    const copies = await noticesFor(owner.id);
    expect(copies).toHaveLength(1);
    expect(copies[0].data.notice?.params.views).toBe(2);
    const { data: copyPush } = await service
      .from("notification_delivery")
      .select("channel")
      .eq("notification_id", copies[0].id);
    expect(copyPush).toEqual([{ channel: "push" }]);

    // The same week again sends nothing.
    const { data: again } = await service.rpc("listing_views_weekly_notices", {
      p_now: NOW,
    });
    expect(Number(again)).toBe(0);
    expect(await noticesFor(organizer.id)).toHaveLength(1);
  });

  it("refuses a source tag it does not know", async () => {
    const { error } = await service.from("event_analytics_event").insert({
      event_id: busy,
      event_type: "view",
      platform: "web",
      source: "instagram",
    } as never);
    expect(error?.message).toContain("event_analytics_event_source_check");
  });
});
