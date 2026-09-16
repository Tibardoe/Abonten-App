import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  drainCloudinaryCleanupQueueCore,
  enqueueCloudinaryCleanup,
  sweepUnregisteredContentUploadsCore,
} from "../platform/cloudinaryCleanupCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

// Cloudinary cleanup queue (migration 20260916131000): clients can no longer
// read or write it (it decides what gets destroyed), the maintenance drain
// claims rows once and retries failures, and the daily sweep queues only
// old uploads that never became a content_media row.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const svc = getServiceClient() as unknown as ServiceRoleClient;
let user: TestUser;
const tag = `it-cleanup-${crypto.randomUUID().slice(0, 8)}`;

async function rowsFor(publicId: string) {
  const { data } = await svc
    .from("draft_asset_cleanup_queue")
    .select("status, attempts")
    .eq("public_id", publicId);
  return data ?? [];
}

beforeAll(async () => {
  user = await createTestUser(svc as never);
  // Nothing else in the queue should be destroyed by these tests' fakes.
  await svc
    .from("draft_asset_cleanup_queue")
    .update({ status: "failed", detail: "parked by integration test" } as never)
    .eq("status", "queued");
});

afterAll(async () => {
  await svc
    .from("draft_asset_cleanup_queue")
    .delete()
    .like("public_id", `%${tag}%`);
  await deleteTestUser(svc as never, user.id);
});

describe("cloudinary cleanup queue", () => {
  it("is closed to clients, so nobody can queue someone else's media", async () => {
    const insert = await user.client
      .from("draft_asset_cleanup_queue")
      .insert({ public_id: `user_profiles/victim/${tag}` } as never);
    expect(insert.error).not.toBeNull();
    const read = await user.client
      .from("draft_asset_cleanup_queue")
      .select("id")
      .limit(1);
    expect(read.data ?? []).toHaveLength(0);
    const rpc = await user.client.rpc(
      "cloudinary_cleanup_enqueue" as never,
      {
        p_public_id: `user_profiles/victim/${tag}`,
        p_resource_type: "image",
      } as never,
    );
    expect(rpc.error).not.toBeNull();
  });

  it("drains once, treats 'not found' as done and retries failures", async () => {
    const ok = `content_media/${user.id}/${tag}-ok`;
    const gone = `content_media/${user.id}/${tag}-gone`;
    const flaky = `content_media/${user.id}/${tag}-flaky`;
    await enqueueCloudinaryCleanup(svc, ok, "video");
    await enqueueCloudinaryCleanup(svc, ok, "video"); // no duplicate
    await enqueueCloudinaryCleanup(svc, gone, "image");
    await enqueueCloudinaryCleanup(svc, flaky, "image");
    expect(await rowsFor(ok)).toHaveLength(1);

    const destroyed: string[] = [];
    const summary = await drainCloudinaryCleanupQueueCore({
      client: svc,
      destroy: async (publicId) => {
        destroyed.push(publicId);
        if (publicId === flaky) throw new Error("rate limited");
        return { result: publicId === gone ? "not found" : "ok" };
      },
    });
    expect(summary.destroyed).toBe(2);
    expect(summary.retrying).toBe(1);
    expect((await rowsFor(ok))[0].status).toBe("done");
    expect((await rowsFor(gone))[0].status).toBe("done");
    expect(await rowsFor(flaky)).toEqual([{ status: "queued", attempts: 1 }]);

    // A second drain never touches finished rows.
    destroyed.length = 0;
    await drainCloudinaryCleanupQueueCore({
      client: svc,
      destroy: async (publicId) => {
        destroyed.push(publicId);
        return { result: "ok" };
      },
    });
    expect(destroyed).toEqual([flaky]);
  });

  it("sweeps only old uploads that were never registered, at most once a day", async () => {
    const now = Date.now();
    const old = new Date(now - 3 * 86_400_000).toISOString();
    const fresh = new Date(now - 60_000).toISOString();
    const registered = `content_media/${user.id}/${tag}-registered`;
    const abandoned = `content_media/${user.id}/${tag}-abandoned`;
    const inFlight = `content_media/${user.id}/${tag}-inflight`;
    await svc.from("content_media").insert({
      owner_id: user.id,
      media_type: "image",
      public_id: registered,
      version: 1,
      bytes: 10,
      media_url: "https://res.cloudinary.com/demo/image/upload/x",
      status: "ready",
      playback_status: "none",
    } as never);

    const list = async ({ resourceType }: { resourceType: string }) => ({
      resources:
        resourceType === "image"
          ? [
              { public_id: registered, created_at: old },
              { public_id: abandoned, created_at: old },
              { public_id: inFlight, created_at: fresh },
            ]
          : [],
    });
    const first = await sweepUnregisteredContentUploadsCore({
      client: svc,
      listResources: list,
      now: () => now,
      sweepEveryHours: 0,
    });
    expect(first.ran).toBe(true);
    expect(first.queued).toBe(1);
    expect(await rowsFor(abandoned)).toHaveLength(1);
    expect(await rowsFor(registered)).toHaveLength(0);
    expect(await rowsFor(inFlight)).toHaveLength(0);
    // The normal cadence refuses a second sweep straight after.
    const second = await sweepUnregisteredContentUploadsCore({
      client: svc,
      listResources: list,
      now: () => now,
    });
    expect(second.ran).toBe(false);
    await svc.from("content_media").delete().eq("public_id", registered);
  });
});
