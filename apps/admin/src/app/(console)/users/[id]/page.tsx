import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Stat,
  timeAgo,
} from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadUserDetail } from "@/lib/data";
import Link from "next/link";
import { UserActions } from "./UserActions";

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const res = await loadUserDetail(id);

  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "User not found."}</EmptyState>;
  }
  const u = res.data;
  const tone =
    u.status === "Active"
      ? "success"
      : u.status === "Suspended"
        ? "warning"
        : "danger";

  return (
    <div>
      <PageHeader
        title={u.username ?? u.fullName ?? "User"}
        description={
          <Link href="/users" className="text-primary hover:underline">
            ← Back to users
          </Link>
        }
        actions={<Badge tone={tone}>{u.status}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Profile</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Full name</dt>
              <dd>{u.fullName ?? "—"}</dd>
              <dt className="text-muted-foreground">Username</dt>
              <dd>{u.username ?? "—"}</dd>
              <dt className="text-muted-foreground">Staff</dt>
              <dd>{u.isAdmin ? "yes" : "no"}</dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>
                {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
              </dd>
              {u.email !== null && (
                <>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd>{u.email}</dd>
                </>
              )}
              {u.phone !== null && (
                <>
                  <dt className="text-muted-foreground">Phone</dt>
                  <dd>{u.phone}</dd>
                </>
              )}
              {u.lastSignInAt && (
                <>
                  <dt className="text-muted-foreground">Last sign-in</dt>
                  <dd>{timeAgo(u.lastSignInAt)}</dd>
                </>
              )}
            </dl>
            {u.bio ? (
              <p className="mt-2 text-sm text-muted-foreground">{u.bio}</p>
            ) : null}
            {u.email === null && (
              <p className="mt-2 text-xs text-muted-foreground">
                Contact details require the <code>users.view_pii</code>{" "}
                permission.
              </p>
            )}
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Events organized" value={u.stats.eventsOrganized} />
            <Stat label="Tickets purchased" value={u.stats.ticketsPurchased} />
            <Stat label="Reviews written" value={u.stats.reviewsWritten} />
            <Stat label="Reports filed" value={u.stats.reportsFiled} />
            <Stat
              label="Reports against"
              value={u.stats.reportsAgainst}
              tone={u.stats.reportsAgainst > 0 ? "warning" : undefined}
            />
            <Stat label="Claims filed" value={u.stats.claimsFiled} />
          </div>

          {u.recentReportsAgainst.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Recent reports against this account
              </h3>
              <ul className="space-y-1 text-sm">
                {u.recentReportsAgainst.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/reports/${r.id}`}
                      className="text-primary hover:underline"
                    >
                      {r.category}
                    </Link>{" "}
                    <span className="text-muted-foreground">
                      · {r.status} · {timeAgo(r.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <UserActions
            userId={u.id}
            status={u.status}
            isAdmin={u.isAdmin}
            permissions={ctx.permissions}
            stepUpFresh={
              !!ctx.reauthenticatedAt &&
              Date.now() - ctx.reauthenticatedAt < 10 * 60 * 1000
            }
          />
        </div>
      </div>
    </div>
  );
}
