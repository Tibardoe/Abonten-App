import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  timeAgo,
} from "@/components/ui";
import { loadPlaceDetail } from "@/lib/data";
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

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await loadPlaceDetail(id);
  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Place not found."}</EmptyState>;
  }
  const p = res.data;

  return (
    <div>
      <PageHeader
        title={p.name}
        description={
          <Link href="/places" className="text-primary hover:underline">
            ← Back to places
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone="neutral">{p.status}</Badge>
            {p.claimed ? <Badge tone="info">claimed</Badge> : null}
            {p.moderationState ? (
              <Badge tone={modTone(p.moderationState)}>
                {p.moderationState}
              </Badge>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat
          label="Rating"
          value={p.reviewCount > 0 ? p.avgRating.toFixed(1) : "—"}
          hint={`${p.reviewCount} review(s)`}
        />
        <Stat label="Upcoming events" value={p.upcomingEventCount} />
        <Stat
          label="Pending claims"
          value={p.pendingClaimCount}
          tone={p.pendingClaimCount > 0 ? "warning" : undefined}
          href="/claims"
        />
        <Stat
          label="Reports"
          value={p.reportCount}
          tone={p.reportCount > 0 ? "warning" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Details</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Owner</dt>
              <dd>
                {p.ownerId ? (
                  <Link
                    href={`/organizers/${p.ownerId}`}
                    className="text-primary hover:underline"
                  >
                    {p.ownerName ?? `${p.ownerId.slice(0, 8)}…`}
                  </Link>
                ) : (
                  "unclaimed"
                )}
              </dd>
              <dt className="text-muted-foreground">Slug</dt>
              <dd>{p.slug ?? "—"}</dd>
              <dt className="text-muted-foreground">Verified</dt>
              <dd>{p.verified ? "yes" : "no"}</dd>
              <dt className="text-muted-foreground">Added</dt>
              <dd>{new Date(p.createdAt).toLocaleString()}</dd>
            </dl>
            {p.description ? (
              <p className="mt-3 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
                {p.description}
              </p>
            ) : null}
            {p.moderationReason ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Moderation reason: {p.moderationReason}
              </p>
            ) : null}
          </Card>

          {p.recentReports.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Recent reports</h3>
              <ul className="space-y-1 text-sm">
                {p.recentReports.map((r) => (
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

          {p.notes.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Internal notes</h3>
              <ul className="space-y-2 text-sm">
                {p.notes.map((n) => (
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
            Hide / remove / restore from the{" "}
            <Link
              href="/content?type=place"
              className="text-primary hover:underline"
            >
              Content tab
            </Link>
            . Ownership transfers only via{" "}
            <Link href="/claims" className="text-primary hover:underline">
              Claims
            </Link>
            .
          </Card>
        </div>
      </div>
    </div>
  );
}
