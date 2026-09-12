import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requireAdmin } from "@/lib/adminGuard";
import { loadVerificationCaseDetail } from "@/lib/data";
import { VERIFICATION_STATUS_TONE } from "@abonten/core/verification/copy";
import Link from "next/link";
import { DecisionPanel } from "./DecisionPanel";
import { NoteForm } from "./NoteForm";

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default async function VerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const res = await loadVerificationCaseDetail(id);

  if (res.status !== 200 || !res.data) {
    return (
      <EmptyState>
        {res.message ?? "Verification request not found."}
      </EmptyState>
    );
  }
  const c = res.data;
  const isPlace = c.subjectType === "place";
  const subjectHref = isPlace
    ? `/places/${c.subject.id}`
    : `/organizers/${c.subject.id}`;

  return (
    <div>
      <PageHeader
        title={`Verification · ${c.subject.name ?? c.subject.id.slice(0, 8)}`}
        description={
          <Link href="/verification" className="text-primary hover:underline">
            ← Back to verification
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={isPlace ? "info" : "neutral"}>{c.subjectType}</Badge>
            <Badge tone={VERIFICATION_STATUS_TONE[c.status]}>
              {c.status.replace("_", " ")}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Warn before a reviewer wastes time: the RPC will refuse this. */}
          {c.subject.ownerChangedSinceSubmission ? (
            <Card className="border-warning p-4">
              <p className="text-sm font-medium text-warning">
                This place changed owner after the request was filed.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                It can no longer be approved for this applicant. Reject it and
                let the new owner apply.
              </p>
            </Card>
          ) : null}

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">
              {isPlace ? "Place" : "Organizer"}
            </h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>
                <Link
                  href={subjectHref}
                  className="text-primary hover:underline"
                >
                  {c.subject.name ?? c.subject.id.slice(0, 8)}
                </Link>
              </dd>
              <dt className="text-muted-foreground">
                {isPlace ? "Listing status" : "Account status"}
              </dt>
              <dd>{c.subject.status ?? "—"}</dd>
              {isPlace ? (
                <>
                  <dt className="text-muted-foreground">Moderation</dt>
                  <dd>{c.subject.moderationState ?? "visible"}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Currently verified</dt>
              <dd>{c.subject.verified ? "yes" : "no"}</dd>
              <dt className="text-muted-foreground">Open reports</dt>
              <dd
                className={
                  c.subject.openReportCount > 0 ? "text-warning" : undefined
                }
              >
                {c.subject.openReportCount}
              </dd>
            </dl>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Applicant</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Account</dt>
              <dd>
                <Link
                  href={`/users/${c.requester.id}`}
                  className="text-primary hover:underline"
                >
                  {c.requester.fullName ??
                    c.requester.username ??
                    c.requester.id.slice(0, 8)}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Account status</dt>
              <dd>{c.requester.accountStatus ?? "—"}</dd>
              <dt className="text-muted-foreground">Name on documents</dt>
              <dd>{c.legalName ?? "—"}</dd>
              {c.organizerType ? (
                <>
                  <dt className="text-muted-foreground">Organizer type</dt>
                  <dd>{c.organizerType}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Email</dt>
              <dd>{c.contactEmail ?? c.requester.email ?? "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{c.contactPhone ?? "—"}</dd>
            </dl>
            {!ctx.permissions.includes("users.view_pii") ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Contact details are hidden — they need the "view personal
                information" permission.
              </p>
            ) : null}
            {c.applicantNote ? (
              <p className="mt-3 whitespace-pre-wrap rounded bg-muted p-2 text-sm">
                {c.applicantNote}
              </p>
            ) : null}
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Documents ({c.evidence.length})
            </h3>
            {c.evidence.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents were attached.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {c.evidence.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded border border-border p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {d.evidenceTypeLabel ?? d.evidenceType}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {d.fileName ?? "Untitled"} · {kb(d.sizeBytes)} ·{" "}
                        {d.mimeType}
                        {d.status !== "uploaded" ? ` · ${d.status}` : ""}
                      </p>
                    </div>
                    {d.url ? (
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-primary hover:underline"
                      >
                        Open
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {c.canOpenEvidence
                ? "Links expire after 5 minutes. Documents are deleted once the retention period ends."
                : "You don't have permission to open these documents."}
            </p>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">History</h3>
            <ol className="space-y-2 text-sm">
              {c.timeline.map((t) => (
                <li key={t.id} className="flex gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">
                    {timeAgo(t.createdAt)}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">
                      {t.eventType.replace(/_/g, " ")}
                    </span>
                    {t.actorName ? (
                      <span className="text-muted-foreground">
                        {" "}
                        by {t.actorName}
                      </span>
                    ) : t.actorKind === "system" ? (
                      <span className="text-muted-foreground"> automatic</span>
                    ) : null}
                    {t.reason ? (
                      <span className="block text-muted-foreground">
                        {t.reason}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Internal notes</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Staff only. The applicant never sees these — put anything they
              must act on in the decision reason instead.
            </p>
            {c.notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            ) : (
              <ul className="mb-3 space-y-2 text-sm">
                {c.notes.map((n) => (
                  <li key={n.id} className="rounded bg-muted p-2">
                    <p className="whitespace-pre-wrap">{n.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.authorName ?? "Staff"} · {timeAgo(n.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <NoteForm caseId={c.id} />
          </Card>

          {c.priorCases.length > 0 ? (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">
                Earlier requests for this {c.subjectType}
              </h3>
              <ul className="space-y-1 text-sm">
                {c.priorCases.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Badge tone={VERIFICATION_STATUS_TONE[p.status]}>
                      {p.status.replace("_", " ")}
                    </Badge>
                    <Link
                      href={`/verification/${p.id}`}
                      className="text-primary hover:underline"
                    >
                      {timeAgo(p.createdAt)}
                    </Link>
                    <span className="text-muted-foreground">
                      {p.evidenceCount} document
                      {p.evidenceCount === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div>
          <DecisionPanel
            caseId={c.id}
            status={c.status}
            subjectType={c.subjectType}
            canReview={ctx.permissions.includes("verification.review")}
            canRevoke={ctx.permissions.includes("verification.revoke")}
            stepUpFresh={
              !!ctx.reauthenticatedAt &&
              Date.now() - ctx.reauthenticatedAt <= 10 * 60 * 1000
            }
            ownerChanged={c.subject.ownerChangedSinceSubmission}
            evidenceCount={c.evidence.length}
          />
        </div>
      </div>
    </div>
  );
}
