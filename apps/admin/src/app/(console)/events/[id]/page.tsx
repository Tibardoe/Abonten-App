import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  money,
  timeAgo,
} from "@/components/ui";
import { loadEventDetail } from "@/lib/data";
import Link from "next/link";

function modTone(s: string | null) {
  return s === "removed"
    ? "danger"
    : s === "hidden"
      ? "warning"
      : s === "restricted"
        ? "info"
        : "neutral";
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await loadEventDetail(id);
  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Event not found."}</EmptyState>;
  }
  const e = res.data;

  return (
    <div>
      <PageHeader
        title={e.title}
        description={
          <Link href="/events" className="text-primary hover:underline">
            ← Back to events
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{e.status}</Badge>
            {e.moderationState ? (
              <Badge tone={modTone(e.moderationState)}>
                {e.moderationState}
              </Badge>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Tickets issued" value={e.ticketsSold} />
        <Stat
          label="Gross (list price)"
          value={money(e.grossSales, e.currency)}
        />
        <Stat
          label="Rating"
          value={e.reviewCount > 0 ? e.avgRating.toFixed(1) : "—"}
          hint={`${e.reviewCount} review(s)`}
        />
        <Stat
          label="Reports"
          value={e.reportCount}
          tone={e.reportCount > 0 ? "warning" : undefined}
          href="/reports?view=grouped"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Details</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Organizer</dt>
              <dd>
                <Link
                  href={`/organizers/${e.organizerId}`}
                  className="text-primary hover:underline"
                >
                  {e.organizerName ?? `${e.organizerId.slice(0, 8)}…`}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Category</dt>
              <dd>{e.category ?? "—"}</dd>
              <dt className="text-muted-foreground">Capacity</dt>
              <dd>{e.capacity ?? "—"}</dd>
              <dt className="text-muted-foreground">Starts</dt>
              <dd>
                {e.startsAt ? new Date(e.startsAt).toLocaleString() : "—"}
              </dd>
              <dt className="text-muted-foreground">Event code</dt>
              <dd>{e.eventCode ?? "—"}</dd>
              <dt className="text-muted-foreground">At place</dt>
              <dd>
                {e.placeId ? (
                  <Link
                    href={`/places/${e.placeId}`}
                    className="text-primary hover:underline"
                  >
                    {e.placeId.slice(0, 8)}…
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {e.description ? (
              <p className="mt-3 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
                {e.description}
              </p>
            ) : null}
            {e.moderationReason ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Moderation reason: {e.moderationReason}
              </p>
            ) : null}
          </Card>

          {e.recentReports.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Recent reports</h3>
              <ul className="space-y-1 text-sm">
                {e.recentReports.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/reports/${r.id}`}
                      className="text-primary hover:underline"
                    >
                      {r.category}
                    </Link>
                    <span className="text-muted-foreground">
                      {" "}
                      · {r.status} · {timeAgo(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {e.notes.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Internal notes</h3>
              <ul className="space-y-2 text-sm">
                {e.notes.map((n) => (
                  <li key={n.id} className="rounded bg-muted/50 p-2">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.authorName ?? "admin"} · {timeAgo(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="p-4 text-sm text-muted-foreground">
            To hide / remove / restore this event, use the{" "}
            <Link
              href="/content?type=event"
              className="text-primary hover:underline"
            >
              Content tab
            </Link>{" "}
            or an open report. Financial detail lives in Finance (later phase).
          </Card>
        </div>
      </div>
    </div>
  );
}
