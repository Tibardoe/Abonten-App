import {
  Card,
  EmptyState,
  PageHeader,
  Table,
  Td,
  Th,
  timeAgo,
} from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadSafetySession } from "@/lib/data";
import type { SafetyTimelineEntry } from "@abonten/types/safetyType";
import Link from "next/link";
import { SafetyTabs } from "../SafetyTabs";
import { safetyStatusBadge } from "../safetyStatus";

// One Safety session for support: who was told, how each text, email and
// push went (with the provider's error when it failed), who opened it and
// what they answered, and the timeline. Never where the person was, never
// what their note said.

const ANSWER = {
  on_my_way: "On the way",
  calling: "Calling",
  cant_help: "Can't help",
} as const;

function timelineText(e: SafetyTimelineEntry): string {
  switch (e.kind) {
    case "started":
      return "Started";
    case "alerted":
      return e.reason === "check_in_missed"
        ? "Check-in missed: contacts alerted"
        : "SOS: contacts alerted";
    case "note":
      return "Note changed";
    case "extended":
      return "More time added";
    case "event_team":
      return "Event team told";
    case "viewed":
      return `${e.name ?? "A recipient"} opened it`;
    case "acknowledged":
      return `${e.name ?? "A recipient"}: ${e.acknowledgement ? ANSWER[e.acknowledgement] : "answered"}`;
    case "resolved":
      return e.resolution === "false_alarm"
        ? "Closed: a mistake"
        : e.resolution === "ended"
          ? "Closed: stopped"
          : "Closed: safe";
    case "expired":
      return "Ran out";
    case "reminded":
      return "Reminded to check in";
  }
}

export default async function SafetySessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermissionPage("safety.view");
  const { id } = await params;
  const { session } = await loadSafetySession(id);
  const s = session.data;
  if (session.status !== 200 || !s) {
    return (
      <div>
        <PageHeader title="Safety session" />
        <SafetyTabs active="/safety" />
        <EmptyState>
          {session.message ?? "Couldn't load the session."}
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${s.kind === "sos" ? "SOS" : s.kind === "check_in" ? "Check-in" : "Location share"} by ${s.userName ?? s.userId.slice(0, 8)}`}
        description={`Started ${timeAgo(s.startedAt)} from the ${s.createdVia === "web" ? "website" : "app"}.${s.eventTitle ? ` Event: ${s.eventTitle}.` : ""}`}
      />
      <SafetyTabs active="/safety" />
      <Card className="grid gap-3 p-4 text-sm md:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">State</p>
          {safetyStatusBadge(s)}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Person</p>
          <Link
            href={`/users/${s.userId}`}
            className="underline underline-offset-2"
          >
            {s.userName ?? s.userId}
          </Link>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Positions received</p>
          <p>
            {s.locationCount}
            {s.lastLocatedAt ? `, last ${timeAgo(s.lastLocatedAt)}` : ""}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Alerted</p>
          <p>{s.alertedAt ? timeAgo(s.alertedAt) : "No"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            {s.resolvedAt ? "Closed" : "Ends"}
          </p>
          <p>{timeAgo(s.resolvedAt ?? s.endsAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Note for contacts</p>
          <p>{s.hasNote ? "Yes (not shown)" : "No"}</p>
        </div>
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Who was told</h2>
        {s.recipientsDetail.length === 0 ? (
          <EmptyState>Nobody was told.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Recipient</Th>
                <Th>Phone</Th>
                <Th>Opened</Th>
                <Th>Answer</Th>
              </tr>
            </thead>
            <tbody>
              {s.recipientsDetail.map((r) => (
                <tr key={r.id}>
                  <Td>
                    {r.kind === "event_team"
                      ? `Event team (${r.name})`
                      : r.name}
                  </Td>
                  <Td>{r.maskedPhone ?? "—"}</Td>
                  <Td>
                    {r.viewedAt
                      ? `${timeAgo(r.viewedAt)}, ${r.viewCount}×`
                      : "Not yet"}
                  </Td>
                  <Td>{r.acknowledgement ? ANSWER[r.acknowledgement] : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Messages</h2>
        {s.messages.length === 0 ? (
          <EmptyState>No messages.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>To</Th>
                <Th>What</Th>
                <Th>Channel</Th>
                <Th>Status</Th>
                <Th>Tries</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {s.messages.map((m) => (
                <tr key={m.id}>
                  <Td>{m.recipientName ?? "—"}</Td>
                  <Td>{m.purpose.replace(/_/g, " ")}</Td>
                  <Td>
                    {m.channel === "sms"
                      ? "Text"
                      : m.channel === "email"
                        ? "Email"
                        : "Push"}
                  </Td>
                  <Td>
                    {m.status}
                    {m.sentAt ? `, ${timeAgo(m.sentAt)}` : ""}
                  </Td>
                  <Td>{m.attempts}</Td>
                  <Td className="max-w-xs truncate text-xs text-muted-foreground">
                    {m.lastError ?? "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Timeline</h2>
        <Card className="p-4">
          <ol className="space-y-1 text-sm">
            {s.timeline.map((e) => (
              <li
                key={`${e.kind}-${e.at}`}
                className="flex justify-between gap-4"
              >
                <span>{timelineText(e)}</span>
                <span className="text-muted-foreground">{timeAgo(e.at)}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>
    </div>
  );
}
