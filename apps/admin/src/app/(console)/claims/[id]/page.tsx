import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadClaimDetail } from "@/lib/data";
import type { ClaimCurrentOwner } from "@abonten/types/adminTypes";
import Link from "next/link";
import { ReviewPanel } from "./ReviewPanel";

const ACCOUNT_STATUS: Record<number, string> = {
  1: "active",
  2: "suspended",
  3: "banned",
  4: "deleted",
};

const SINCE_BASIS: Record<ClaimCurrentOwner["sinceBasis"], string> = {
  claim_approved: "their claim was approved",
  team_created: "the team was made from the person who held it",
  listed: "they listed it",
};

function day(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "unknown";
}

function nameOf(p: {
  name: string | null;
  username: string | null;
  id: string;
}) {
  return p.name || (p.username ? `@${p.username}` : `${p.id.slice(0, 8)}…`);
}

/** Who runs the place now, for a waiting claim. */
function CurrentOwnerCard({
  owner,
  isDispute,
  situation,
}: {
  owner: ClaimCurrentOwner;
  isDispute: boolean;
  situation: string | null;
}) {
  return (
    <Card
      className={
        isDispute ? "border-destructive/60 bg-destructive/5 p-4" : "p-4"
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Who runs the place now</h3>
        {isDispute ? <Badge tone="danger">Ownership dispute</Badge> : null}
      </div>
      {isDispute ? (
        <p className="mb-3 text-sm">
          {situation === "team_member"
            ? "The claimant is a member of the team that owns this place. Approving moves the place out of the team to the claimant personally."
            : "Another account runs this place. Approving takes it away from them at once. They were not told about this claim: decide whether to contact them before you decide."}
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted-foreground">
          {owner.kind === "team" ? "Team" : "Owner"}
        </dt>
        <dd>
          <Link
            href={`/users/${owner.id}`}
            className="text-primary hover:underline"
          >
            {nameOf(owner)}
          </Link>
          {owner.username && owner.name ? (
            <span className="text-muted-foreground"> @{owner.username}</span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">Account</dt>
        <dd>
          {owner.statusId ? (ACCOUNT_STATUS[owner.statusId] ?? "—") : "—"}
          {owner.teamStatus && owner.teamStatus !== "active"
            ? ` · team ${owner.teamStatus}`
            : ""}
        </dd>
        {owner.kind === "team" ? (
          <>
            <dt className="text-muted-foreground">Team Owners</dt>
            <dd>
              {owner.teamOwners.length === 0
                ? "none"
                : owner.teamOwners.map((o, i) => (
                    <span key={o.id}>
                      {i > 0 ? ", " : ""}
                      <Link
                        href={`/users/${o.id}`}
                        className="text-primary hover:underline"
                      >
                        {nameOf(o)}
                      </Link>
                    </span>
                  ))}
            </dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Has had it since</dt>
        <dd>
          {day(owner.since)}{" "}
          <span className="text-muted-foreground">
            ({SINCE_BASIS[owner.sinceBasis]})
          </span>
        </dd>
      </dl>
    </Card>
  );
}

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
          {c.currentOwner &&
          (c.isDispute || c.situation === "listed_by_abonten") ? (
            <CurrentOwnerCard
              owner={c.currentOwner}
              isDispute={c.isDispute}
              situation={c.situation}
            />
          ) : null}

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
            canVerify={ctx.permissions.includes("verification.review")}
            documentCount={c.documents.length}
            placeAlreadyVerified={c.place.verified}
            isDispute={c.isDispute}
            placeName={c.place.name}
            currentOwnerName={c.currentOwner ? nameOf(c.currentOwner) : null}
          />
        </div>
      </div>
    </div>
  );
}
