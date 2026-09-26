import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FAIL_RUNS,
  escalateAndAlertCore,
} from "../admin/observability/incidentAlertsCore";
import {
  type TestUser,
  createTestUser,
  deleteTestUser,
  getServiceClient,
} from "./setupClient";
// Requires a local Supabase stack (npm run test:db:up at the repo root).
//
// Audit 2026-09-26 (migration 20260926100600): a health check that fails
// FAIL_RUNS runs in a row opens one incident, and each new incident is
// emailed once to the active super-admins; a failed send is retried.

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_TEST_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

const svc = getServiceClient() as unknown as ServiceRoleClient;
const key = `it-alert-${crypto.randomUUID().slice(0, 8)}`;
let admin: TestUser;
let adminEmail: string;

type Sent = { to: string[]; subject: string; text: string };

async function writeRuns(ok: boolean, count: number) {
  const now = Date.now();
  const rows = Array.from({ length: count }, (_, i) => ({
    check_key: key,
    ok,
    latency_ms: 5,
    detail: { reason: `run ${i}` },
    checked_at: new Date(now - (count - i) * 1000).toISOString(),
  }));
  const { error } = await svc.from("health_check_result").insert(rows as never);
  if (error) throw new Error(error.message);
}

async function openIncidents() {
  const { data } = await svc
    .from("incident")
    .select("id, status, alerted_at, severity")
    .eq("component", `health.${key}`);
  return data ?? [];
}

beforeAll(async () => {
  admin = await createTestUser(svc as never);
  const { data } = await svc.auth.admin.getUserById(admin.id);
  adminEmail = data.user?.email ?? "";
  await svc
    .from("admin_user")
    .insert({ user_id: admin.id, status: "active" } as never);
  await svc
    .from("admin_user_role")
    .insert({ user_id: admin.id, role_key: "super_admin" } as never);
  // Only this test's incident should be claimed by the fakes below.
  await svc
    .from("incident")
    .update({ alerted_at: new Date().toISOString() } as never)
    .is("alerted_at", null);
});

afterAll(async () => {
  await svc.from("incident").delete().eq("component", `health.${key}`);
  await svc.from("health_check_result").delete().eq("check_key", key);
  await svc.from("admin_user_role").delete().eq("user_id", admin.id);
  await svc.from("admin_user").delete().eq("user_id", admin.id);
  await deleteTestUser(svc as never, admin.id);
});

describe("incident escalation and alerts", () => {
  it("does nothing while a check has failed fewer runs than the threshold", async () => {
    await writeRuns(false, FAIL_RUNS - 1);
    const result = await escalateAndAlertCore(svc, [key]);
    expect(result.opened).toBe(0);
    expect(await openIncidents()).toHaveLength(0);
  });

  it("opens one incident after enough failed runs and emails the super-admins once", async () => {
    await writeRuns(false, 1);
    const sent: Sent[] = [];
    const first = await escalateAndAlertCore(svc, [key], async (m) => {
      sent.push(m);
      return true;
    });
    expect(first).toMatchObject({ opened: 1, alerted: 1 });
    const [incident] = await openIncidents();
    expect(incident).toMatchObject({
      status: "investigating",
      severity: "high",
    });
    expect(incident.alerted_at).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toContain(adminEmail);
    expect(sent[0].subject).toContain(key);
    expect(sent[0].text).toContain("admin.abontenhub.com/monitoring");

    // Still failing: no second incident, no second email.
    await writeRuns(false, 1);
    const again = await escalateAndAlertCore(svc, [key], async (m) => {
      sent.push(m);
      return true;
    });
    expect(again).toMatchObject({ opened: 0, alerted: 0 });
    expect(await openIncidents()).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("retries an alert whose email failed", async () => {
    const [incident] = await openIncidents();
    await svc
      .from("incident")
      .update({ alerted_at: null } as never)
      .eq("id", incident.id);

    const failed = await escalateAndAlertCore(svc, [key], async () => false);
    expect(failed.alerted).toBe(0);
    expect((await openIncidents())[0].alerted_at).toBeNull();

    const sent: Sent[] = [];
    const retried = await escalateAndAlertCore(svc, [key], async (m) => {
      sent.push(m);
      return true;
    });
    expect(retried.alerted).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("keeps the functions away from signed-in clients", async () => {
    for (const fn of [
      "health_escalate_failing",
      "incident_alert_claim",
      "incident_alert_recipients",
    ]) {
      const { error } = await admin.client.rpc(fn as never, {} as never);
      expect(error, fn).not.toBeNull();
    }
  });
});
