import {
  EmptyState,
  PageHeader,
  Stat,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadSafetyOverview } from "@/lib/data";
import type { SafetyAdminSessionRow } from "@abonten/types/safetyType";
import Link from "next/link";
import { SafetyTabs } from "./SafetyTabs";
import { safetyStatusBadge } from "./safetyStatus";

// Admin › Safety: how Safety is used and whether its texts arrive, for
// support ("my contact never got it") and for the rollout decisions. It
// never shows where anyone was or what they wrote to their contacts.

const KIND: Record<SafetyAdminSessionRow["kind"], string> = {
  sos: "SOS",
  check_in: "Check-in",
  share: "Location share",
};

type Params = Record<string, string | string[] | undefined>;

function hrefWith(
  params: Params,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && !(k in changes) && k !== "before")
      next.set(k, v);
  }
  for (const [k, v] of Object.entries(changes)) if (v) next.set(k, v);
  const qs = next.toString();
  return `/safety${qs ? `?${qs}` : ""}`;
}

function FilterLink({
  params,
  name,
  value,
  label,
}: {
  params: Params;
  name: string;
  value: string | null;
  label: string;
}) {
  const active =
    (typeof params[name] === "string" ? params[name] : null) === value;
  return (
    <Link
      href={hrefWith(params, { [name]: value })}
      aria-current={active ? "page" : undefined}
      className={`rounded border px-2 py-1 text-xs ${active ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
    >
      {label}
    </Link>
  );
}

export default async function SafetyPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  await requirePermissionPage("safety.view");
  const params = await searchParams;
  const { overview, sessions } = await loadSafetyOverview(params);
  const o = overview.data;

  return (
    <div>
      <PageHeader
        title="Safety"
        description="SOS alerts, check-ins and location shares: who was told and whether the texts went. Positions and notes are never shown here."
      />
      <SafetyTabs active="/safety" />
      {o ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat
            label="Open now"
            value={o.openNow}
            tone={o.openNow > 0 ? "warning" : undefined}
          />
          <Stat
            label={`Alerts, ${o.windowDays} days`}
            value={o.alerts}
            hint={`${o.missedCheckIns} missed check-ins, ${o.falseAlarms} mistakes`}
          />
          <Stat
            label={`Sessions, ${o.windowDays} days`}
            value={
              o.sessionsByKind.sos +
              o.sessionsByKind.check_in +
              o.sessionsByKind.share
            }
            hint={`${o.sessionsByKind.sos} SOS, ${o.sessionsByKind.check_in} check-ins, ${o.sessionsByKind.share} shares`}
          />
          <Stat
            label={`Messages, ${o.windowDays} days`}
            value={o.messages.sent}
            hint={`${o.messages.failed} failed, ${o.messages.pending} waiting`}
            tone={o.messages.failed > 0 ? "danger" : undefined}
          />
          <Stat
            label="Trusted contacts"
            value={o.contacts.total}
            hint={`${o.peopleWithContacts} people, ${o.contacts.accepted} accepted, ${o.contacts.declined} declined`}
          />
        </div>
      ) : (
        <EmptyState>
          {overview.message ?? "Couldn't load the overview."}
        </EmptyState>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterLink
          params={params}
          name="kind"
          value={null}
          label="All kinds"
        />
        <FilterLink params={params} name="kind" value="sos" label="SOS" />
        <FilterLink
          params={params}
          name="kind"
          value="check_in"
          label="Check-ins"
        />
        <FilterLink params={params} name="kind" value="share" label="Shares" />
        <span className="mx-1 h-4 w-px bg-border" />
        <FilterLink
          params={params}
          name="status"
          value={null}
          label="Any state"
        />
        <FilterLink
          params={params}
          name="status"
          value="alerting"
          label="Alert open"
        />
        <FilterLink
          params={params}
          name="status"
          value="active"
          label="Running"
        />
        <FilterLink
          params={params}
          name="status"
          value="resolved"
          label="Closed"
        />
        <FilterLink
          params={params}
          name="status"
          value="expired"
          label="Ran out"
        />
      </div>

      {sessions.status !== 200 || !sessions.data ? (
        <EmptyState>
          {sessions.message ?? "Couldn't load the sessions."}
        </EmptyState>
      ) : sessions.data.rows.length === 0 ? (
        <EmptyState>No sessions match.</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Person</Th>
                <Th>Kind</Th>
                <Th>State</Th>
                <Th>Told</Th>
                <Th>Opened / answered</Th>
                <Th>Messages</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.rows.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <Link
                      href={`/safety/${r.id}`}
                      className="underline underline-offset-2"
                    >
                      {timeAgo(r.startedAt)}
                    </Link>
                  </Td>
                  <Td>
                    <Link
                      href={`/users/${r.userId}`}
                      className="underline underline-offset-2"
                    >
                      {r.userName ?? r.userId.slice(0, 8)}
                    </Link>
                  </Td>
                  <Td>
                    {KIND[r.kind]}
                    {r.alertReason === "check_in_missed" ? " (missed)" : ""}
                    {r.eventTitle ? (
                      <span className="block text-xs text-muted-foreground">
                        {r.eventTitle}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{safetyStatusBadge(r)}</Td>
                  <Td>{r.recipients}</Td>
                  <Td>
                    {r.viewed} / {r.acknowledged}
                  </Td>
                  <Td>
                    {r.messagesSent} sent
                    {r.messagesFailed > 0 ? (
                      <span className="text-destructive">
                        , {r.messagesFailed} failed
                      </span>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {sessions.data.nextBefore ? (
            <div className="mt-3">
              <Link
                className="text-sm underline underline-offset-2"
                href={hrefWith(params, { before: sessions.data.nextBefore })}
              >
                Older sessions
              </Link>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
