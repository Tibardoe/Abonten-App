import { Badge, Card, EmptyState, PageHeader, timeAgo } from "@/components/ui";
import { requirePermissionPage } from "@/lib/adminGuard";
import { loadIdentityDetail } from "@/lib/data";
import { STEP_UP_MAX_AGE_MS } from "@abonten/core/adminPermissions";
import Link from "next/link";
import {
  PROVIDER_VERDICT,
  documentLabel,
  identityStatusBadge,
} from "../identityStatus";
import { IdentityDecisionPanel } from "./IdentityDecisionPanel";
import { RevealIdentityDetails } from "./RevealIdentityDetails";

// One identity check: what the provider said, which other accounts hold the
// same document or the same person, and the timeline. The person's details
// stay hidden until a reviewer with identity.view_pii asks for them.

const ACTOR: Record<string, string> = {
  user: "the person",
  provider: "the provider",
  system: "Abonten",
  staff: "staff",
};

function yesNo(v: boolean | null): string {
  return v === null ? "—" : v ? "Yes" : "No";
}

export default async function IdentityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermissionPage("identity.view");
  const { ctx, detail } = await loadIdentityDetail(id);

  if (detail.status !== 200 || !detail.data) {
    return (
      <EmptyState>{detail.message ?? "Identity check not found."}</EmptyState>
    );
  }
  const d = detail.data;
  const stepUpFresh =
    !!ctx.reauthenticatedAt &&
    Date.now() - ctx.reauthenticatedAt < STEP_UP_MAX_AGE_MS;

  return (
    <div>
      <PageHeader
        title={`Identity · ${d.username ? `@${d.username}` : d.userId.slice(0, 8)}`}
        description={
          <Link href="/identity" className="text-primary hover:underline">
            ← Back to identity checks
          </Link>
        }
        actions={identityStatusBadge(d.status)}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {d.matches.length > 0 ? (
            <Card className="border-warning p-4">
              <p className="text-sm font-medium text-warning">
                The same document or the same person is on{" "}
                {d.matches.length === 1
                  ? "another account"
                  : `${d.matches.length} other accounts`}
                .
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                It may be one person with two accounts, or a document used by
                someone it doesn&apos;t belong to. Compare before approving.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {d.matches.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2">
                    <Link
                      href={`/users/${m.userId}`}
                      className="text-primary hover:underline"
                    >
                      {m.username ? `@${m.username}` : m.userId.slice(0, 8)}
                    </Link>
                    {identityStatusBadge(m.verificationStatus)}
                    {m.revoked ? (
                      <Badge tone="danger">Revoked before</Badge>
                    ) : null}
                    {m.accountStatus !== 1 ? (
                      <Badge tone="neutral">Account not active</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Check</h3>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Person</dt>
              <dd>
                <Link
                  href={`/users/${d.userId}`}
                  className="text-primary hover:underline"
                >
                  {d.displayName ?? (d.username ? `@${d.username}` : d.userId)}
                </Link>
                {d.accountStatus !== 1 ? (
                  <Badge tone="neutral" className="ml-2">
                    Account not active
                  </Badge>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">Document</dt>
              <dd>{documentLabel(d.documentCountry, d.documentType)}</dd>
              <dt className="text-muted-foreground">Method</dt>
              <dd>{d.verificationMethod}</dd>
              <dt className="text-muted-foreground">Provider</dt>
              <dd>
                {d.provider === "test" ? "Test stand-in" : "Smile ID"}
                {d.providerJobId ? (
                  <span className="block font-mono text-xs text-muted-foreground">
                    {d.providerJobId}
                  </span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">Provider said</dt>
              <dd>
                {d.resultStatus ? PROVIDER_VERDICT[d.resultStatus] : "—"}
                {d.resultReason ? (
                  <span className="block text-xs text-muted-foreground">
                    {d.resultReason}
                  </span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">Fraud signal</dt>
              <dd>
                {yesNo(d.fraudDetected)}
                {d.riskLevel ? ` (risk ${d.riskLevel})` : ""}
              </dd>
              <dt className="text-muted-foreground">
                Provider found the face elsewhere
              </dt>
              <dd>{yesNo(d.providerDuplicate)}</dd>
              <dt className="text-muted-foreground">Adult</dt>
              <dd>{yesNo(d.isAdult)}</dd>
              <dt className="text-muted-foreground">Decision</dt>
              <dd>
                {d.decidedAt
                  ? `${timeAgo(d.decidedAt)} by ${d.decisionSource ?? "—"}`
                  : "—"}
                {d.decisionReason ? (
                  <span className="block text-xs text-muted-foreground">
                    {d.decisionReason}
                  </span>
                ) : null}
              </dd>
              <dt className="text-muted-foreground">Valid until</dt>
              <dd>{d.validUntil ? d.validUntil.slice(0, 10) : "—"}</dd>
              <dt className="text-muted-foreground">Agreed</dt>
              <dd>
                {timeAgo(d.consentAt)} (notice {d.consentNoticeVersion})
              </dd>
              {d.accountDeletedAt ? (
                <>
                  <dt className="text-muted-foreground">Account deleted</dt>
                  <dd>{timeAgo(d.accountDeletedAt)}</dd>
                </>
              ) : null}
            </dl>
          </Card>

          <RevealIdentityDetails
            verificationId={d.id}
            canView={ctx.permissions.includes("identity.view_pii")}
            stepUpFresh={stepUpFresh}
            next={`/identity/${d.id}`}
          />

          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
            {d.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="space-y-2 text-sm">
                {d.events.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <span className="text-muted-foreground">
                      {timeAgo(e.at)}
                    </span>{" "}
                    {e.fromStatus && e.toStatus
                      ? `${e.fromStatus} → ${e.toStatus}`
                      : e.kind}{" "}
                    <span className="text-muted-foreground">
                      by {ACTOR[e.actorKind] ?? e.actorKind}
                    </span>
                    {e.reason ? (
                      <span className="block text-xs text-muted-foreground">
                        {e.reason}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div>
          <IdentityDecisionPanel
            verificationId={d.id}
            status={d.status}
            accountActive={d.accountStatus === 1}
            canReview={ctx.permissions.includes("identity.review")}
            canRevoke={ctx.permissions.includes("identity.revoke")}
            stepUpFresh={stepUpFresh}
          />
        </div>
      </div>
    </div>
  );
}
