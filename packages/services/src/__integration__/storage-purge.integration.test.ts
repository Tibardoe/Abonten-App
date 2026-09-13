import type { Database } from "@abonten/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
// Migration 20260913200000_storage_purge_queue: the retention jobs no
// longer delete from storage.objects (which Supabase refuses and which never
// removed the files anyway); they enqueue (bucket, path) rows that
// purgeQueuedStorageObjectsCore deletes through the Storage API.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeQueuedStorageObjectsCore } from "../platform/storagePurgeCore";
import {
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";

type QueueRow = Database["public"]["Tables"]["storage_purge_queue"]["Row"];

describe("storage purge queue", () => {
  let service: SupabaseClient<Database>;
  const bucket = "place-claim-documents";
  const path = `integration/${crypto.randomUUID()}.pdf`;

  async function rows(): Promise<QueueRow[]> {
    const { data } = await service
      .from("storage_purge_queue")
      .select("*")
      .eq("bucket_id", bucket)
      .eq("object_path", path)
      .order("id");
    return (data ?? []) as QueueRow[];
  }

  beforeAll(async () => {
    service = getServiceClient();
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY =
      process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
  });

  afterAll(async () => {
    // service_role has no DELETE on the queue by design; clean up through
    // the finish function by leaving rows 'done' (harmless test residue).
  });

  it("the retention jobs run without touching storage.objects", async () => {
    const claims = await service.rpc("purge_reviewed_claim_documents");
    expect(claims.error).toBeNull();
    const evidence = await service.rpc("purge_verification_evidence");
    expect(evidence.error).toBeNull();
    expect(evidence.data).toHaveProperty("orphans");
  });

  it("enqueue is idempotent while a row is open; claim hands it out once", async () => {
    await service.rpc("storage_purge_enqueue", {
      p_bucket: bucket,
      p_path: path,
      p_reason: "integration",
    });
    await service.rpc("storage_purge_enqueue", {
      p_bucket: bucket,
      p_path: path,
      p_reason: "integration",
    });
    expect(await rows()).toHaveLength(1);

    const first = await service.rpc("storage_purge_claim", { p_limit: 500 });
    expect(first.error).toBeNull();
    const mine = (first.data ?? []).filter((r) => r.object_path === path);
    expect(mine).toHaveLength(1);
    const second = await service.rpc("storage_purge_claim", { p_limit: 500 });
    expect(
      (second.data ?? []).filter((r) => r.object_path === path),
    ).toHaveLength(0);
    expect((await rows())[0]).toMatchObject({ status: "sending", attempts: 1 });

    // A failure goes back to the queue for the next dispatch...
    const requeued = await service.rpc("storage_purge_finish", {
      p_ids: [mine[0].purge_id],
      p_status: "queued",
      p_detail: "simulated",
    });
    expect(requeued.data).toBe(1);
    expect((await rows())[0]).toMatchObject({
      status: "queued",
      detail: "simulated",
    });
  });

  it("the core deletes through the Storage API and records the outcome", async () => {
    const removed: { bucket: string; paths: string[] }[] = [];
    const res = await purgeQueuedStorageObjectsCore({
      client: service as never,
      removeObjects: async (b, paths) => {
        removed.push({ bucket: b, paths });
        return { error: null };
      },
    });
    expect(res.status).toBe(200);
    expect(
      removed.some((r) => r.bucket === bucket && r.paths.includes(path)),
    ).toBe(true);
    expect((await rows())[0]).toMatchObject({ status: "done", attempts: 2 });
    expect(res.summary.deleted).toBeGreaterThanOrEqual(1);
  });

  it("an API error keeps the row for a retry", async () => {
    const path2 = `integration/${crypto.randomUUID()}.pdf`;
    await service.rpc("storage_purge_enqueue", {
      p_bucket: bucket,
      p_path: path2,
      p_reason: "integration",
    });
    const res = await purgeQueuedStorageObjectsCore({
      client: service as never,
      removeObjects: async () => ({ error: "storage down" }),
    });
    expect(res.summary.retrying).toBeGreaterThanOrEqual(1);
    const { data } = await service
      .from("storage_purge_queue")
      .select("status, detail, attempts")
      .eq("object_path", path2)
      .single();
    expect(data).toMatchObject({ status: "queued", detail: "storage down" });
    // Leave it done so later runs of this suite start clean.
    const { data: again } = await service.rpc("storage_purge_claim", {
      p_limit: 500,
    });
    const ids = (again ?? []).map((r) => r.purge_id);
    if (ids.length > 0) {
      await service.rpc("storage_purge_finish", {
        p_ids: ids,
        p_status: "done",
      });
    }
  });

  it("a signed-in person can neither read nor drive the queue", async () => {
    const person = await createTestUser(service);
    try {
      const claim = await person.client.rpc("storage_purge_claim", {
        p_limit: 1,
      });
      expect(claim.error).not.toBeNull();
      const read = await person.client
        .from("storage_purge_queue")
        .select("id")
        .limit(1);
      expect(read.error).not.toBeNull();
      const config = await person.client
        .from("storage_purge_config")
        .select("token")
        .limit(1);
      expect(config.error).not.toBeNull();
    } finally {
      await deleteTestUser(service, person.id);
    }
  });
});
