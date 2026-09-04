import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  money,
  timeAgo,
} from "@/components/ui";
import { loadOrganizerDetail } from "@/lib/data";
import Link from "next/link";

function statusTone(s: string) {
  return s === "Banned" ? "danger" : s === "Suspended" ? "warning" : "success";
}
function modTone(s: string | null) {
  return s === "removed"
    ? "danger"
    : s === "hidden"
      ? "warning"
      : s === "restricted"
        ? "info"
        : "neutral";
}

export default async function OrganizerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await loadOrganizerDetail(id);
  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Organizer not found."}</EmptyState>;
  }
  const o = res.data;
  const s = o.stats;

  return (
    <div>
      <PageHeader
        title={o.fullName || o.username || `${o.id.slice(0, 8)}…`}
        description={
          <Link href="/organizers" className="text-primary hover:underline">
            ← Back to organizers
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(o.accountStatus)}>{o.accountStatus}</Badge>
            {o.isAdmin ? <Badge tone="info">staff</Badge> : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Events" value={s.events} />
        <Stat label="Places" value={s.places} />
        <Stat label="Tickets issued" value={s.ticketsSold} />
        <Stat
          label="Gross (list price)"
          value={money(s.grossSales, s.currency)}
        />
        <Stat
          label="Organizer rating"
          value={
            s.organizerRatingCount > 0 ? s.avgOrganizerRating.toFixed(1) : "—"
          }
          hint={`${s.organizerRatingCount} review(s)`}
        />
        <Stat
          label="Reports against"
          value={s.reportsAgainst}
          tone={s.reportsAgainst > 0 ? "warning" : undefined}
        />
        <Stat
          label="Hidden / removed content"
          value={s.hiddenOrRemovedContent}
          tone={s.hiddenOrRemovedContent > 0 ? "warning" : undefined}
        />
        <Stat
          label="Account"
          value={o.accountStatus}
          hint="manage in Users"
          href={`/users/${o.id}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Profile</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Username</dt>
              <dd>{o.username ? `@${o.username}` : "—"}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{o.email ?? "(hidden)"}</dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>
                {o.createdAt ? new Date(o.createdAt).toLocaleString() : "—"}
              </dd>
            </dl>
            {o.bio ? (
              <p className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
                {o.bio}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Recent events ({o.recentEvents.length})
            </h3>
            {o.recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {o.recentEvents.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <Link
                      href={`/events/${e.id}`}
                      className="text-primary hover:underline line-clamp-1"
                    >
                      {e.title}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {e.status}
                    </span>
                    {e.moderationState ? (
                      <Badge tone={modTone(e.moderationState)}>
                        {e.moderationState}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {o.places.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Places ({o.places.length})
              </h3>
              <ul className="space-y-1 text-sm">
                {o.places.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Link
                      href={`/places/${p.id}`}
                      className="text-primary hover:underline line-clamp-1"
                    >
                      {p.name}
                    </Link>
                    {p.moderationState ? (
                      <Badge tone={modTone(p.moderationState)}>
                        {p.moderationState}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {o.recentReportsAgainst.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Reports against</h3>
              <ul className="space-y-1 text-sm">
                {o.recentReportsAgainst.map((r) => (
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

          {o.notes.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Internal notes</h3>
              <ul className="space-y-2 text-sm">
                {o.notes.map((n) => (
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
            Suspend / ban this account from{" "}
            <Link
              href={`/users/${o.id}`}
              className="text-primary hover:underline"
            >
              the user record
            </Link>
            . Content moderation is per-item under{" "}
            <Link href="/content" className="text-primary hover:underline">
              Content
            </Link>
            .
          </Card>
        </div>
      </div>
    </div>
  );
}
