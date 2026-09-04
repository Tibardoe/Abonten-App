import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadClaimDetail } from "@/lib/data";
import Link from "next/link";
import { ReviewPanel } from "./ReviewPanel";

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const res = await loadClaimDetail(id);

  if (res.status !== 200 || !res.data) {
    return <EmptyState>{res.message ?? "Claim not found."}</EmptyState>;
  }
  const c = res.data;

  return (
    <div>
      <PageHeader
        title={`Claim · ${c.place.name ?? c.place.id.slice(0, 8)}`}
        description={
          <Link href="/claims" className="text-primary hover:underline">
            ← Back to claims
          </Link>
        }
        actions={
          <Badge
            tone={
              c.status === "pending"
                ? "warning"
                : c.status === "approved"
                  ? "success"
                  : "neutral"
            }
          >
            {c.status}
          </Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Place</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{c.place.name ?? "—"}</dd>
              <dt className="text-muted-foreground">Listing status</dt>
              <dd>{c.place.status ?? "—"}</dd>
              <dt className="text-muted-foreground">Currently claimed</dt>
              <dd>{c.place.claimed ? "yes" : "no"}</dd>
              <dt className="text-muted-foreground">Current owner</dt>
              <dd>
                {c.place.currentOwnerId ? (
                  <Link
                    href={`/organizers/${c.place.currentOwnerId}`}
                    className="text-primary hover:underline"
                  >
                    {c.place.currentOwnerId.slice(0, 8)}…
                  </Link>
                ) : (
                  "unclaimed"
                )}
              </dd>
            </dl>
            {c.place.slug ? (
              <p className="mt-2 text-xs text-muted-foreground">
                /{c.place.slug}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Claimant</h3>
            <p className="text-sm">
              <Link
                href={`/users/${c.claimant.id}`}
                className="text-primary hover:underline"
              >
                {c.claimant.fullName ||
                  c.claimant.username ||
                  `${c.claimant.id.slice(0, 8)}…`}
              </Link>
              {c.claimant.email ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {c.claimant.email}
                </span>
              ) : null}
            </p>
            {c.contactEmail || c.contactPhone ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Contact: {c.contactEmail ?? "—"}
                {c.contactPhone ? ` · ${c.contactPhone}` : ""}
              </p>
            ) : null}
            {c.note ? (
              <p className="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
                {c.note}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Supporting documents ({c.documents.length})
            </h3>
            {c.documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents attached.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {c.documents.map((d) => (
                  <li key={d.id}>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {d.fileName ?? "document"}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">
                        {d.fileName ?? "document"} (link expired)
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {" "}
                      · {d.mimeType ?? "?"} ·{" "}
                      {d.sizeBytes
                        ? `${Math.round(d.sizeBytes / 1024)} KB`
                        : "?"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Links expire after 5 minutes.
            </p>
          </Card>

          {c.reviewedAt ? (
            <Card className="p-4">
              <h3 className="mb-1 text-sm font-semibold">Review</h3>
              <p className="text-sm">
                {c.status} by {c.reviewedByName ?? "admin"} ·{" "}
                {timeAgo(c.reviewedAt)}
              </p>
            </Card>
          ) : null}

          {c.notes.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Internal notes</h3>
              <ul className="space-y-2 text-sm">
                {c.notes.map((n) => (
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
          <ReviewPanel
            claimId={c.id}
            canReview={ctx.permissions.includes("claims.review")}
            isPending={c.status === "pending"}
          />
        </div>
      </div>
    </div>
  );
}
