import { logger } from "@abonten/core/logger";
import type { ServiceRoleClient } from "@abonten/types/supabaseClientType";

// Telling a person when production is unhealthy (audit 2026-09-26).
//
// Before this, failed health checks and incidents were visible only on
// Admin › Monitoring: the Abonten Weekly check stayed red for five days and
// nobody saw it. Run after every health check (every 2 minutes):
//   1. a check that failed its last FAIL_RUNS runs opens an incident
//      (health_escalate_failing — never a duplicate of an open one);
//   2. every open incident not yet alerted — from any source — is emailed
//      once to the active super-admins. A failed send is released and tried
//      again on the next run.
// The email transport is injected by the web route, so this stays free of
// framework code.

/** Consecutive failed runs before a check becomes an incident (~6 min). */
export const FAIL_RUNS = 3;

export type SendAlertEmail = (message: {
  to: string[];
  subject: string;
  text: string;
}) => Promise<boolean>;

export type ClaimedIncident = {
  id: string;
  title: string;
  severity: string;
  component: string | null;
  summary: string | null;
  started_at: string;
};

const MONITORING_URL = "https://admin.abontenhub.com/monitoring";

export function incidentAlertText(incidents: ClaimedIncident[]): {
  subject: string;
  text: string;
} {
  const first = incidents[0];
  const subject =
    incidents.length === 1
      ? `[Abonten ${first.severity}] ${first.title}`
      : `[Abonten] ${incidents.length} new incidents`;
  const lines = incidents.map((i) =>
    [
      `- ${i.title} (${i.severity}${i.component ? `, ${i.component}` : ""})`,
      `  Opened ${i.started_at}`,
      i.summary ? `  ${i.summary}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  const text = [
    incidents.length === 1
      ? "A new incident was opened on Abonten."
      : "New incidents were opened on Abonten.",
    "",
    ...lines,
    "",
    `Review and resolve them in Admin › Monitoring: ${MONITORING_URL}`,
    "",
    "You get this because you are a super-admin. Each incident is emailed once.",
  ].join("\n");
  return { subject, text };
}

export async function escalateAndAlertCore(
  client: ServiceRoleClient,
  checkKeys: string[],
  sendAlert?: SendAlertEmail,
): Promise<{ opened: number; alerted: number }> {
  const summary = { opened: 0, alerted: 0 };

  const escalated = await client.rpc("health_escalate_failing", {
    p_keys: checkKeys,
    p_runs: FAIL_RUNS,
  });
  if (escalated.error) {
    logger.error(`health_escalate_failing: ${escalated.error.message}`);
  } else {
    summary.opened = Number(escalated.data ?? 0);
  }

  if (!sendAlert) return summary;

  const claimed = await client.rpc("incident_alert_claim", { p_limit: 20 });
  if (claimed.error) {
    logger.error(`incident_alert_claim: ${claimed.error.message}`);
    return summary;
  }
  const incidents = (claimed.data ?? []) as ClaimedIncident[];
  if (incidents.length === 0) return summary;
  const ids = incidents.map((i) => i.id);

  const release = async (why: string) => {
    logger.warn(`Incident alert not sent (${why}); retrying next run`, {
      incidents: ids.length,
    });
    await client.rpc("incident_alert_release", { p_ids: ids });
  };

  const recipients = await client.rpc("incident_alert_recipients");
  const to = ((recipients.data ?? []) as { email: string }[])
    .map((r) => r.email)
    .filter(Boolean);
  if (recipients.error || to.length === 0) {
    await release(recipients.error?.message ?? "no active super-admin");
    return summary;
  }

  const { subject, text } = incidentAlertText(incidents);
  let sent = false;
  try {
    sent = await sendAlert({ to, subject, text });
  } catch (error) {
    logger.error("Incident alert email failed", error);
  }
  if (!sent) {
    await release("email send failed");
    return summary;
  }
  summary.alerted = incidents.length;
  return summary;
}
